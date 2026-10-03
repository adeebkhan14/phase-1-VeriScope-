
import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import searchRouter from "./routes/search.js";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/search", searchRouter);

app.get("/", (req, res) => {
  res.json({
    name: "VeriScope API",
    status: "running",
  });
});

const PORT = 5001;

app.listen(PORT, () => {
  console.log(`VeriScope backend running on port ${PORT}`);
});
