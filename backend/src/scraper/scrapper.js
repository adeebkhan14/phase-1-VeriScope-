import { chromium } from "playwright";
import { embedSearchResults } from "./gemini.js";

const MAX_SOURCES = 15;
const SCRAPE_CONCURRENCY = 5;

export async function scrapePages(urls, query) {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const scrapedPages = [];
    const candidates = urls.slice(0, MAX_SOURCES);

    for (
      let index = 0;
      index < candidates.length;
      index += SCRAPE_CONCURRENCY
    ) {
      const batch = candidates.slice(index, index + SCRAPE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((item) => scrapePage(browser, item))
      );

      results.forEach((result, resultIndex) => {
        if (result.status === "fulfilled") {
          scrapedPages.push(result.value);
        } else {
          console.warn(
            `Failed to scrape ${batch[resultIndex].url}:`,
            result.reason
          );
        }
      });
    }

    return query
      ? embedSearchResults(query, scrapedPages)
      : scrapedPages;
  } finally {
    await browser.close();
  }
}

async function scrapePage(browser, item) {
  const page = await browser.newPage();

  try {
    await page.goto(item.url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const title = await page.title();

    const content = await page.locator("body").innerText();

    return {
      title: title || item.title,
      searchTitle: item.title,
      url: item.url,
      snippet: item.snippet,
      content: cleanText(content),
    };
  } finally {
    await page.close();
  }
}

function cleanText(text) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
}