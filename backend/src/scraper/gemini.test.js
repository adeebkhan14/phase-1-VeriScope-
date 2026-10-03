import assert from "node:assert/strict";
import test from "node:test";
import {
  cosineSimilarity,
  embedSearchResults,
  GeminiError,
  interpretSearchQuery,
  rankByEmbedding,
} from "./gemini.js";

test("ranks sources by embedding cosine similarity and keeps ties stable", () => {
  const sources = [
    { title: "Relevant", url: "https://example.com/relevant" },
    { title: "Less relevant", url: "https://example.com/less" },
    { title: "Equal relevance", url: "https://example.com/equal" },
  ];
  const ranked = rankByEmbedding(sources, [1, 0], [
    [0.9, 0.1],
    [0, 1],
    [0.9, 0.1],
  ]);

  assert.deepEqual(
    ranked.map(({ url }) => url),
    [
      "https://example.com/relevant",
      "https://example.com/equal",
      "https://example.com/less",
    ]
  );
  assert.ok(ranked[0].relevanceScore > ranked[2].relevanceScore);
  assert.equal(ranked[0].relevanceScore, 99);
});

test("calculates cosine similarity", () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
});

test("rejects incompatible or empty embeddings", () => {
  assert.throws(() => cosineSimilarity([1, 0], [1]), GeminiError);
  assert.throws(() => cosineSimilarity([0, 0], [1, 0]), GeminiError);
});

test("interprets a typo and research intent using Gemini", async (t) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });

  let requestBody;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(
      String(url),
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"
    );
    assert.equal(options.headers["x-goog-api-key"], "test-key");
    requestBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    searchQuery: "masturbation",
                    semanticQuery:
                      "Health information about masturbation and sexual wellness",
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });

  const result = await interpretSearchQuery("masterbation");

  assert.deepEqual(result, {
    searchQuery: "masturbation",
    semanticQuery:
      "Health information about masturbation and sexual wellness",
    corrected: true,
  });
  assert.match(requestBody.contents[0].parts[0].text, /masterbation/);
  assert.equal(requestBody.generationConfig.responseMimeType, "application/json");
});

test("retries and falls back to a lighter model when Gemini is overloaded", async (t) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });

  const requestedModels = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requestedModels.push(String(url));
    if (requestedModels.length < 3) {
      return new Response(
        JSON.stringify({
          error: {
            message: "This model is currently experiencing high demand.",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    searchQuery: "weather tomorrow",
                    semanticQuery: "Forecast for tomorrow's weather",
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });

  const result = await interpretSearchQuery("weather tomorrow");

  assert.equal(result.corrected, false);
  assert.equal(requestedModels.length, 3);
  assert.match(requestedModels[0], /gemini-3\.5-flash-lite:generateContent/);
  assert.match(requestedModels[1], /gemini-3\.5-flash-lite:generateContent/);
  assert.match(requestedModels[2], /gemini-2\.5-flash-lite:generateContent/);
});

test("uses Gemini embeddings to semantically rank scraped pages", async (t) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });

  let requestBody;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(
      String(url),
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents"
    );
    requestBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        embeddings: [
          { values: [1, 0] },
          { values: [0.8, 0.6] },
          { values: [0, 1] },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });

  const ranked = await embedSearchResults("electric vehicle charging", [
    {
      title: "EV charging networks",
      snippet: "Charging stations and infrastructure.",
      content: "How electric vehicle charging networks are deployed.",
      url: "https://example.com/related",
    },
    {
      title: "Baking sourdough bread",
      snippet: "A beginner recipe.",
      content: "Flour, water, and fermentation.",
      url: "https://example.com/unrelated",
    },
  ]);

  assert.deepEqual(
    ranked.map(({ url }) => url),
    ["https://example.com/related", "https://example.com/unrelated"]
  );
  assert.equal(requestBody.requests[0].taskType, "RETRIEVAL_QUERY");
  assert.ok(
    requestBody.requests
      .slice(1)
      .every(({ taskType }) => taskType === "RETRIEVAL_DOCUMENT")
  );
  assert.match(
    requestBody.requests[1].content.parts[0].text,
    /Charging stations and infrastructure/
  );
});

test("requires a server-side Gemini API key", async (t) => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (previousKey !== undefined) process.env.GEMINI_API_KEY = previousKey;
  });

  await assert.rejects(
    interpretSearchQuery("test query"),
    (error) =>
      error instanceof GeminiError &&
      error.statusCode === 503 &&
      /GEMINI_API_KEY/.test(error.message)
  );
});
