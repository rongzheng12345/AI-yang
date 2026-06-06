import assert from "node:assert/strict";
import test from "node:test";

import handler from "../api/chat.js";

test("vercel chat api returns local grounded answer without an OpenAI key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const response = createMockResponse();
  await handler({
    method: "POST",
    body: {
      caseId: "mma-20260417",
      question: "Hcy 最新是多少？",
    },
  }, response);

  if (previousKey) process.env.OPENAI_API_KEY = previousKey;

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.mode, "local");
  assert.match(response.body.answer, /Hcy 最新值/);
});

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end(body) {
      this.body = typeof body === "string" ? JSON.parse(body) : body;
      return this;
    },
  };
}
