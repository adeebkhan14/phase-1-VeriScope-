import { chromium } from "playwright";
import { interpretSearchQuery } from "./gemini.js";

const SEARCH_PAGES = 2;
const RESULTS_PER_PAGE = 10;

export async function discoverUrls(query) {
  const { urls } = await discoverSearch(query);
  return urls;
}

export async function discoverSearch(query) {
  const interpretation = await interpretSearchQuery(query);
  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage();

  try {
    const firstPageUrl = buildSearchUrl(interpretation.searchQuery, 1);
    console.log("Searching:", firstPageUrl);
    await page.goto(firstPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    if (interpretation.corrected) {
      console.log(
        `Gemini corrected search query: "${query}" -> "${interpretation.searchQuery}"`
      );
    }

    const results = [];
    const visitedUrls = new Set();

    for (let pageNumber = 0; pageNumber < SEARCH_PAGES; pageNumber += 1) {
      const offset = pageNumber * RESULTS_PER_PAGE + 1;
      if (pageNumber > 0) {
        const searchUrl = buildSearchUrl(interpretation.searchQuery, offset);
        console.log("Searching:", searchUrl);
        try {
          await page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
        } catch (error) {
          if (pageNumber === 0) throw error;
          console.warn(
            `Could not load search results page ${pageNumber + 1}:`,
            error
          );
          break;
        }
      }

      const pageResults = await readSearchResults(page);

      for (const result of pageResults) {
        if (visitedUrls.has(result.url)) continue;
        visitedUrls.add(result.url);
        results.push(result);
      }
    }

    return {
      urls: results,
      query: interpretation.searchQuery,
      semanticQuery: interpretation.semanticQuery,
      corrected: interpretation.corrected,
    };
  } finally {
    await browser.close();
  }
}

async function readSearchResults(page) {
  return page.locator("li.b_algo").evaluateAll((cards) =>
    cards
      .map((card) => {
        const link = card.querySelector("h2 a");
        if (!link) return null;

        const title = link.textContent.trim();
        const snippet =
          card.querySelector(".b_caption p")?.textContent?.trim() || "";
        let url = link.href;

        try {
          const resultUrl = new URL(link.href);
          const encodedUrl = resultUrl.searchParams.get("u");
          if (encodedUrl?.startsWith("a1")) {
            const base64Url = encodedUrl
              .slice(2)
              .replace(/-/g, "+")
              .replace(/_/g, "/");
            url = atob(
              base64Url.padEnd(Math.ceil(base64Url.length / 4) * 4, "=")
            );
          }

          const destination = new URL(url);
          if (!["http:", "https:"].includes(destination.protocol)) return null;
          if (destination.hostname.endsWith("bing.com")) return null;

          destination.hash = "";
          return { title, snippet, url: destination.href };
        } catch {
          return null;
        }
      })
      .filter((item) => item?.title)
  );
}

function buildSearchUrl(query, offset) {
  const searchUrl = new URL("https://www.bing.com/search");
  searchUrl.searchParams.set("q", query);
  if (offset > 1) {
    searchUrl.searchParams.set("first", String(offset));
  }
  return searchUrl.href;
}
