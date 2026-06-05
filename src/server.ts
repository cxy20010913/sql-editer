import express, { type Request, type Response } from "express";
import cors from "cors";
import * as path from "path";
import { chatCompletions } from "./llm/client";
import { buildSystemPrompt, buildUserPrompt } from "./prompts/buildPrompt";
import type { GeneratePayload, SqlDialect } from "./types";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4173;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Static files: simple web frontend
const publicDir = path.join(__dirname, "..", "web");
app.use(express.static(publicDir));

interface GenerateRequestBody extends GeneratePayload {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

app.post("/api/generate", async (req: Request, res: Response) => {
  const body = req.body as Partial<GenerateRequestBody>;
  const { apiBaseUrl, apiKey, model, dialect, tables, temperature } = body;

  if (!apiKey) {
    res.status(400).json({ error: "缺少 apiKey。" });
    return;
  }
  if (!apiBaseUrl) {
    res.status(400).json({ error: "缺少 apiBaseUrl。" });
    return;
  }
  if (!model) {
    res.status(400).json({ error: "缺少 model。" });
    return;
  }
  if (!tables || !Array.isArray(tables) || tables.length === 0) {
    res.status(400).json({ error: "缺少表规格（tables）。" });
    return;
  }

  try {
    const dialectSafe: SqlDialect = (dialect as SqlDialect) ?? "postgresql";
    const system = buildSystemPrompt(dialectSafe);
    const user = buildUserPrompt({
      dialect: dialectSafe,
      tables,
      temperature,
    });

    const sql = await chatCompletions({
      baseUrl: apiBaseUrl,
      apiKey,
      model,
      temperature: typeof temperature === "number" ? temperature : 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    res.json({ sql });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: err });
  }
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`SQL Generator web server listening on http://localhost:${port}`);
});

