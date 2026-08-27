import assert from "node:assert/strict";
import test from "node:test";

import { readCompletionResponse } from "../app/ai-stream.ts";

test("compatible SSE chunks are reconstructed without losing JSON whitespace", async () => {
  const encoder = new TextEncoder();
  const event = (content, extra = {}) => `data: ${JSON.stringify({ choices: [{ delta: { content, ...(extra.reasoning ? { reasoning_content: extra.reasoning } : {}) }, ...(extra.finish ? { finish_reason: extra.finish } : {}) }], ...(extra.usage ? { usage: extra.usage } : {}) })}\n\n`;
  const chunks = [
    event('{"sections":[{"content":"hello'),
    event(" world"),
    event('"}]}', { reasoning: "private", finish: "stop", usage: { completion_tokens: 9 } }),
    "data: [DONE]\n\n",
  ];
  let progress = 0;
  const response = new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
  const raw = await readCompletionResponse(response, true, () => { progress += 1; });
  const parsed = JSON.parse(raw);
  assert.equal(parsed.choices[0].message.content, '{"sections":[{"content":"hello world"}]}');
  assert.equal(parsed.choices[0].message.reasoning_content, "private");
  assert.equal(parsed.choices[0].finish_reason, "stop");
  assert.equal(parsed.usage.completion_tokens, 9);
  assert.equal(progress, chunks.length);
});

test("non-SSE responses pass through unchanged", async () => {
  const raw = '{"choices":[]}';
  const response = new Response(raw, { headers: { "content-type": "application/json" } });
  assert.equal(await readCompletionResponse(response, true, () => assert.fail("unexpected progress")), raw);
});
