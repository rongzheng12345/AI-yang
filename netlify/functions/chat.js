import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildAiPromptPayload, extractResponseText } from "../../src/aiService.js";
import { buildLocalAnswer, buildQuestionContext, getCaseById } from "../../src/clinicalData.js";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const question = String(body.question ?? "").trim();
    if (!question) {
      return jsonResponse(400, { error: "Question is required" });
    }

    const cases = JSON.parse(await readFile(join(process.cwd(), "data/cases.json"), "utf8"));
    const clinicalCase = getCaseById(cases, body.caseId);
    if (!clinicalCase) {
      return jsonResponse(404, { error: "Case not found" });
    }

    const localAnswer = buildLocalAnswer(clinicalCase, question);
    if (!process.env.OPENAI_API_KEY) {
      return jsonResponse(200, {
        mode: "local",
        answer: localAnswer.text,
        note: "未配置 OPENAI_API_KEY，已使用本地病例上下文兜底回答。",
      });
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
      return jsonResponse(200, {
        mode: "local",
        answer: localAnswer.text,
        note: "OpenAI 网络请求失败，已返回本地病例上下文兜底回答。",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!aiResponse.ok) {
      return jsonResponse(502, {
        mode: "local",
        answer: localAnswer.text,
        note: "AI 接口调用失败，已返回本地兜底回答。",
        error: responseBody?.error?.message ?? "OpenAI API error",
      });
    }

    const answer = extractResponseText(responseBody);
    return jsonResponse(200, {
      mode: answer ? "ai" : "local",
      answer: answer || localAnswer.text,
      note: answer ? "已基于病例上下文生成回答。" : "AI 返回为空，已使用本地兜底回答。",
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}
