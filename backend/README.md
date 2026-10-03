# VeriScope backend

## Semantic search setup

Semantic query interpretation and page ranking use the Gemini API. Copy
`.env.example` to `.env` and set `GEMINI_API_KEY` to a Gemini API key from
Google AI Studio. Keep the key in the backend only; never put it in the
frontend or commit `.env`. `GEMINI_MODEL` is optional and defaults to
`gemini-3.5-flash-lite`. If the selected model is temporarily overloaded, the
backend retries it and then tries other available Flash Lite models.

The backend uses `gemini-embedding-001` to rank scraped pages by semantic
similarity. Gemini free-tier usage and rate limits depend on the Google AI
Studio project and model availability. Start the backend from this directory
with `npm run dev` or `npm start`. Search queries and scraped page text are
sent to Gemini for query interpretation and embedding-based ranking.
