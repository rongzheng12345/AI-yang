import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAiPromptPayload, extractResponseText } from "./src/aiService.js";
import { buildLocalAnswer, buildQuestionContext, getCaseById } from "./src/clinicalData.js";
import { loadEnvFile } from "./src/env.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname);

loadEnvFile(join(ROOT, ".env"));

const PORT = Number(process.env.PORT ?? 8000);
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/chat") {
      await handleChat(request, response);
      return;
    }

    if (request.method === "GET") {
      await serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, {
      error: "Server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`Clinical workbench running at http://localhost:${PORT}`);
});

async function handleChat(request, response) {
  const body = await readJsonBody(request);
  const question = String(body.question ?? "").trim();
  if (!question) {
    sendJson(response, 400, { error: "Question is required" });
    return;
  }

  const cases = JSON.parse(await readFile(join(ROOT, "data/cases.json"), "utf8"));
  const clinicalCase = getCaseById(cases, body.caseId);
  if (!clinicalCase) {
    sendJson(response, 404, { error: "Case not found" });
    return;
  }

  const localAnswer = buildLocalAnswer(clinicalCase, question);
  const context = buildQuestionContext(clinicalCase);

  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 200, {
      mode: "local",
      answer: localAnswer.text,
      note: "未配置 OPENAI_API_KEY，已使用本地病例上下文兜底回答。",
    });
    return;
  }

  const payload = buildAiPromptPayload({ model: MODEL, context, question });
  let aiResponse;
  let responseBody;
  try {
    aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    responseBody = await aiResponse.json();
  } catch (error) {
    sendJson(response, 200, {
      mode: "local",
      answer: localAnswer.text,
      note: "OpenAI 网络请求失败，已返回本地病例上下文兜底回答。",
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (!aiResponse.ok) {
    sendJson(response, 502, {
      mode: "local",
      answer: localAnswer.text,
      note: "AI 接口调用失败，已返回本地兜底回答。",
      error: responseBody?.error?.message ?? "OpenAI API error",
    });
    return;
  }

  sendJson(response, 200, {
    mode: "ai",
    answer: extractResponseText(responseBody) || localAnswer.text,
    note: extractResponseText(responseBody) ? "已基于病例上下文生成回答。" : "AI 返回为空，已使用本地兜底回答。",
  });
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = resolve(ROOT, normalize(pathname).replace(/^\/+/, ""));

  if (!filePath.startsWith(ROOT)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
