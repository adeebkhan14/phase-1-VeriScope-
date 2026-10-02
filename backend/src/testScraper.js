import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { discoverUrls } from "./scraper/searchEngine.js";
import { scrapePages } from "./scraper/scrapper.js";

const rl = createInterface({ input, output });

try {
  const query = (await rl.question("What do you want to research? ")).trim();
  rl.close();

  if (!query) {
    console.error("Please enter a search query.");
    process.exitCode = 1;
  } else {
    console.log(`\nSearching for: ${query}\n`);

    const urls = await discoverUrls(query);

    console.log(`Found ${urls.length} URLs`);
    console.log("Starting scraping...\n");

    const results = await scrapePages(urls);

    console.log(`Successfully scraped ${results.length} pages\n`);

    results.forEach((result, index) => {
      console.log(`--- SOURCE ${index + 1} ---`);
      console.log("Title:", result.title);
      console.log("URL:", result.url);
      console.log("Content:", result.content.slice(0, 500));
      console.log();
    });
  }
} catch (error) {
  console.error("Search or scraping failed:", error);
  process.exitCode = 1;
} finally {
  rl.close();
}