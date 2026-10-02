import { chromium } from "playwright";

export async function discoverUrls(query) {
  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage();

  try {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

    console.log("Searching:", searchUrl);

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    const results = await page.locator("li.b_algo h2 a").evaluateAll((links) => {
      return links
        .map((link) => {
          const title = link.textContent.trim();
          const redirectUrl = new URL(link.href);
          const encodedUrl = redirectUrl.searchParams.get("u");
          const base64Url = encodedUrl?.startsWith("a1")
            ? encodedUrl.slice(2).replace(/-/g, "+").replace(/_/g, "/")
            : null;

          return {
            title,
            url: base64Url
              ? atob(base64Url.padEnd(Math.ceil(base64Url.length / 4) * 4, "="))
              : link.href,
          };
        })
        .filter(
          (item) =>
            item.title &&
            item.url.startsWith("http") &&
            !item.url.includes("bing.com")
        )
        .slice(0, 5);
    });

    return results;
  } finally {
    await browser.close();
  }
}