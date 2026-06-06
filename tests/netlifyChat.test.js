import assert from "node:assert/strict";
import test from "node:test";

import { handler } from "../netlify/functions/chat.js";

test("netlify chat function returns local grounded answer without an OpenAI key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const response = await handler({
    httpMethod: "POST",
    body: JSON.stringify({
      caseId: "mma-20260417",
      question: "Hcy 最新是多少？",
    }),
  });

  if (previousKey) process.env.OPENAI_API_KEY = previousKey;

  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.mode, "local");
  assert.match(body.answer, /Hcy 最新值/);
});
