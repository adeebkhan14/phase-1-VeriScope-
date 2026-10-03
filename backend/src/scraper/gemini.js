const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GENERATION_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const GENERATION_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-3.8-flash",
];
const EMBEDDING_MODEL = "gemini-embedding-001";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_EMBEDDING_TEXT_LENGTH = 6_000;
const RETRY_DELAY_MS = 700;

export class GeminiError extends Error {
  constructor(message, statusCode = 502, retryable = false) {
    super(message);
    this.name = "GeminiError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export async function interpretSearchQuery(query) {
  const prompt = [
    "Interpret this web research query.",
    "Correct spelling only when the intended wording is clear from context.",
    "Do not change the topic, entities, or intent, and do not add assumptions.",
    "If the wording is ambiguous or may be a proper name, preserve it unchanged.",
    "Return JSON with exactly two string properties:",
    '"searchQuery": the query to send to a web search engine,',
    '"semanticQuery": a concise description of the same intended meaning for semantic retrieval.',
    "Do not answer the query.",
    `Query: ${JSON.stringify(query)}`,
  ].join("\n");
  const payload = await geminiRequest(GENERATION_MODEL, "generateContent", {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) {
    throw new GeminiError("Gemini returned an empty query interpretation.");
  }

  let interpretation;
  try {
    interpretation = JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini returned an invalid query interpretation.");
  }

  if (
    !interpretation ||
    typeof interpretation !== "object" ||
    typeof interpretation.searchQuery !== "string" ||
    typeof interpretation.semanticQuery !== "string"
  ) {
    throw new GeminiError("Gemini returned an incomplete query interpretation.");
  }

  const searchQuery = interpretation.searchQuery.trim();
  const semanticQuery = interpretation.semanticQuery.trim();
  if (!searchQuery || !semanticQuery) {
    throw new GeminiError("Gemini returned an incomplete query interpretation.");
  }

  return {
    searchQuery,
    semanticQuery,
    corrected: normalize(searchQuery) !== normalize(query),
  };
}

export async function embedSearchResults(semanticQuery, sources) {
  if (sources.length === 0) return [];

  const inputs = [
    {
      text: `Research intent: ${semanticQuery}`,
      taskType: "RETRIEVAL_QUERY",
    },
    ...sources.map((source) => ({
      text: [
        `Title: ${source.title || source.searchTitle || ""}`,
        `Search result summary: ${source.snippet || ""}`,
        `Page content: ${(source.content || "").slice(0, MAX_EMBEDDING_TEXT_LENGTH)}`,
      ].join("\n"),
      taskType: "RETRIEVAL_DOCUMENT",
    })),
  ];
  const payload = await geminiRequest(EMBEDDING_MODEL, "batchEmbedContents", {
    requests: inputs.map(({ text, taskType }) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
    })),
  });

  const embeddings = payload.embeddings?.map((item) => item.values);
  if (
    embeddings?.length !== sources.length + 1 ||
    embeddings.some(
      (embedding) =>
        !Array.isArray(embedding) ||
        embedding.some((value) => !Number.isFinite(value))
    )
  ) {
    throw new GeminiError("Gemini returned invalid semantic embeddings.");
  }

  return rankByEmbedding(sources, embeddings[0], embeddings.slice(1));
}

export function rankByEmbedding(sources, queryEmbedding, documentEmbeddings) {
  return sources
    .map((source, index) => ({
      source,
      index,
      similarity: cosineSimilarity(queryEmbedding, documentEmbeddings[index]),
    }))
    .sort(
      (left, right) =>
        right.similarity - left.similarity || left.index - right.index
    )
    .map(({ source, similarity }) => {
      const { searchTitle, ...rankedSource } = source;
      return {
        ...rankedSource,
        relevanceScore: Math.round(Math.min(1, Math.max(0, similarity)) * 100),
      };
    });
}

export function cosineSimilarity(left, right) {
  if (!left?.length || left.length !== right?.length) {
    throw new GeminiError("Gemini returned embeddings with incompatible dimensions.");
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    throw new GeminiError("Gemini returned an empty semantic embedding.");
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function geminiRequest(model, method, body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError(
      "Semantic search is not configured. Set GEMINI_API_KEY in backend/.env and restart the backend.",
      503
    );
  }

  const models =
    method === "generateContent"
      ? [...new Set([model, ...GENERATION_FALLBACK_MODELS])]
      : [model];
  let lastError;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const payload = await requestModel(apiKey, models[modelIndex], method, body);
        if (modelIndex > 0) {
          console.warn(
            `Gemini primary model was busy; query interpretation succeeded with ${models[modelIndex]}.`
          );
        }
        return payload;
      } catch (error) {
        if (!(error instanceof GeminiError)) throw error;
        lastError = error;
        if (!error.retryable) throw error;

        const hasAnotherAttempt =
          attempt === 0 || modelIndex < models.length - 1;
        if (!hasAnotherAttempt) throw error;

        if (attempt === 0) {
          await delay(RETRY_DELAY_MS * (attempt + 1));
        } else if (modelIndex < models.length - 1) {
          console.warn(
            `Gemini model ${models[modelIndex]} is temporarily unavailable; trying a fallback model.`
          );
        }
      }
    }
  }

  throw lastError || new GeminiError("Gemini request failed.");
}

async function requestModel(apiKey, model, method, body) {
  let response;
  try {
    response = await fetch(`${API_BASE}/${model}:${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const isTimeout = error?.name === "TimeoutError";
    throw new GeminiError(
      isTimeout
        ? "Gemini request timed out. Please retry your search."
        : "Could not connect to the Gemini semantic search service.",
      502,
      true
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new GeminiError("Gemini returned an unreadable response.", 502, true);
  }

  if (!response.ok) {
    const message = payload.error?.message || "Gemini request failed.";
    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      /high demand|temporarily unavailable|resource exhausted|overloaded/i.test(
        message
      );
    throw new GeminiError(
      `Gemini semantic search failed: ${message}`,
      retryable ? 503 : response.status,
      retryable
    );
  }

  return payload;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalize(value) {
  return value.toLocaleLowerCase().trim().replace(/\s+/g, " ");
}
