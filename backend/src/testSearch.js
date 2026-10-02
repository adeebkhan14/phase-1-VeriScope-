import { discoverUrls } from "./scraper/searchEngine.js";

console.log("TEST STARTED");

const results = await discoverUrls("artificial intelligence");

console.log("RESULTS:");
console.log(results);