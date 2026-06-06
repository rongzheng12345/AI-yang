import assert from "node:assert/strict";
import test from "node:test";

import { buildAiPromptPayload, extractResponseText } from "../src/aiService.js";

test("buildAiPromptPayload includes clinical guardrails and case context", () => {
  const payload = buildAiPromptPayload({
    model: "gpt-test",
    context: "诊断: MMA合并型\n最新指标: Hcy: 42.9 umol/L",
    question: "有哪些风险？",
  });

  assert.equal(payload.model, "gpt-test");
  assert.match(payload.input[0].content, /医生审核/);
  assert.match(payload.input[1].content, /诊断: MMA合并型/);
  assert.match(payload.input[1].content, /有哪些风险/);
});

test("extractResponseText reads output_text first and nested message text second", () => {
  assert.equal(extractResponseText({ output_text: "直接文本" }), "直接文本");

  const nested = {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "嵌套文本" }],
      },
    ],
  };

  assert.equal(extractResponseText(nested), "嵌套文本");
});
