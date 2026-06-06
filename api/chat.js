import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildAiPromptPayload, extractResponseText } from "../src/aiService.js";
import { buildLocalAnswer, buildQuestionContext, getCaseById } from "../src/clinicalData.js";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const question = String(body.question ?? "").trim();
    if (!question) {
      sendJson(response, 400, { error: "Question is required" });
      return;
    }

    const cases = JSON.parse(await readFile(join(process.cwd(), "data/cases.json"), "utf8"));
    const clinicalCase = getCaseById(cases, body.caseId);
    if (!clinicalCase) {
      sendJson(response, 404, { error: "Case not found" });
      return;
    }

    const localAnswer = buildLocalAnswer(clinicalCase, question);
    if (!process.env.OPENAI_API_KEY) {
      sendJson(response, 200, {
        mode: "local",
        answer: localAnswer.text,
        note: "未配置 OPENAI_API_KEY，已使用本地病例上下文兜底回答。",
      });
      return;
    }

    const context = buildQuestionContext(clinicalCase);
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

    const answer = extractResponseText(responseBody);
    sendJson(response, 200, {
      mode: answer ? "ai" : "local",
      answer: answer || localAnswer.text,
      note: answer ? "已基于病例上下文生成回答。" : "AI 返回为空，已使用本地兜底回答。",
    });
  } catch (error) {
    sendJson(response, 500, {
      error: "Server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readRequestBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader?.("Content-Type", "application/json; charset=utf-8");
  if (typeof response.status === "function" && typeof response.json === "function") {
    response.status(statusCode).json(body);
    return;
  }
  response.end(JSON.stringify(body));
}
