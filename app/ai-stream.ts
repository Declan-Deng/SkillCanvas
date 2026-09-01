type StreamContent = string | Array<string | { text?: string }> | null | undefined;

export class IncompleteCompletionStreamError extends Error {
  constructor() {
    super("模型输出流在完成前中断；当前内容已保留，请重试当前步骤");
    this.name = "IncompleteCompletionStreamError";
  }
}

function deltaText(content: StreamContent) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => typeof part === "string" ? part : part?.text || "").join("");
}

/** Convert an OpenAI-compatible SSE response back into the non-streaming shape
 * consumed by the existing validation pipeline. Delta whitespace is preserved
 * because it may occur inside JSON string values. */
export async function readCompletionResponse(upstream: Response, streamRequested: boolean, onProgress: () => void) {
  const contentType = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !streamRequested || !/text\/event-stream/i.test(contentType) || !upstream.body) return upstream.text();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoningContent = "";
  let finishReason: string | null = null;
  let usage: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } | undefined;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const event = JSON.parse(payload) as {
        choices?: Array<{
          finish_reason?: string | null;
          delta?: { content?: StreamContent; reasoning_content?: string | null };
        }>;
        usage?: typeof usage;
      };
      const choice = event.choices?.[0];
      const delta = deltaText(choice?.delta?.content);
      const reasoning = choice?.delta?.reasoning_content || "";
      content += delta;
      reasoningContent += reasoning;
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (event.usage) usage = event.usage;
      // Empty keepalives must not keep a stuck generation alive indefinitely.
      if (delta || reasoning || choice?.finish_reason) onProgress();
    } catch {
      // Ignore keepalives or provider-specific non-JSON events. The existing
      // malformed/empty response path decides whether a retry is required.
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    lines.forEach(consumeLine);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeLine(buffer);
  if (!finishReason) throw new IncompleteCompletionStreamError();
  return JSON.stringify({
    choices: [{ finish_reason: finishReason, message: { content, reasoning_content: reasoningContent } }],
    usage,
  });
}
