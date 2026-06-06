import assert from "node:assert/strict";
import test from "node:test";

import { parseEnvContent } from "../src/env.js";

test("parseEnvContent reads simple env key value pairs", () => {
  const env = parseEnvContent(`
OPENAI_API_KEY=sk-test
OPENAI_MODEL=gpt-4.1
`);

  assert.deepEqual(env, {
    OPENAI_API_KEY: "sk-test",
    OPENAI_MODEL: "gpt-4.1",
  });
});

test("parseEnvContent ignores comments and trims quotes", () => {
  const env = parseEnvContent(`
# local secrets
OPENAI_API_KEY="sk-quoted"
EMPTY=
`);

  assert.equal(env.OPENAI_API_KEY, "sk-quoted");
  assert.equal(env.EMPTY, "");
});
