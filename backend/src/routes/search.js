
import express from "express";
import { discoverUrls } from "../scraper/searchEngine.js";
import { scrapePages } from "../scraper/scrapper.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const query = req.body?.query?.trim();

  if (!query) {
    return res.status(400).json({ error: "Enter a search query." });
  }

  try {
    console.log("Received query:", query);
    const urls = await discoverUrls(query);
    const sources = await scrapePages(urls);

    return res.json({ query, sources });
  } catch (error) {
    console.error("Search failed:", error);
    return res.status(500).json({ error: "Search failed. Please try again." });
  }
});

export default router;

