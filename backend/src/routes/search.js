
import express from "express";
import { GeminiError } from "../scraper/gemini.js";
import { discoverSearch } from "../scraper/searchEngine.js";
import { scrapePages } from "../scraper/scrapper.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const query = req.body?.query?.trim();

  if (!query) {
    return res.status(400).json({ error: "Enter a search query." });
  }

  try {
    console.log("Received query:", query);
    const discovery = await discoverSearch(query);
    const sources = await scrapePages(discovery.urls, discovery.semanticQuery);

    return res.json({
      query,
      correctedQuery: discovery.corrected ? discovery.query : null,
      sources,
    });
  } catch (error) {
    console.error("Search failed:", error);
    if (error instanceof GeminiError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: "Search failed. Please try again." });
  }
});

export default router;
