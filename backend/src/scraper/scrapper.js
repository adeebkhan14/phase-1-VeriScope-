import { chromium } from "playwright";

export async function scrapePages(urls) {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const results = await Promise.allSettled(
      urls.map((item) => scrapePage(browser, item))
    );

    return results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
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
      url: item.url,
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