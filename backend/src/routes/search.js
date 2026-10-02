
import express from "express";

const router = express.Router();

router.post("/", (req, res) => {
  const { query } = req.body;

  console.log("Received query:", query);

  res.json({
    query: query,

    sources: [
      {
        title: "Example Research Source",
        url: "https://example.com",
        content: `This is a fake research result for: "${query}"`,
      },
      {
        title: "Another Example Source",
        url: "https://example.org",
        content:
          "This is another fake source. Later, this will contain content scraped from the web.",
      },
      {
        title: "VeriScope Test Source",
        url: "https://example.net",
        content:
          "React successfully received this response from the Node.js backend.",
      },
    ],
  });
});

export default router;

