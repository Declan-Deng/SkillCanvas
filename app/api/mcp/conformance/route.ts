import {
  McpServer,
  acceptedContent,
  createMcpHandler,
  fromJsonSchema,
  inputRequired,
} from "@modelcontextprotocol/server";

export const runtime = "edge";

const inputSchema = fromJsonSchema<{ message: string }>({
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],
  additionalProperties: false,
});

const evidenceSchema = fromJsonSchema<{ query: string; limit?: number }>({
  type: "object",
  properties: {
    query: { type: "string", description: "Evidence search query" },
    limit: { type: "number", default: 5 },
  },
  required: ["query"],
  additionalProperties: false,
});

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: "skillcanvas-conformance", version: "0.1.0" });
  server.registerTool("confirm-and-echo", {
    title: "Confirm and echo",
    description: "Exercises a 2026-07-28 input_required round before returning a verified result.",
    inputSchema,
  }, async ({ message }, context) => {
    const confirmation = acceptedContent<{ approved: boolean }>(context.mcpReq.inputResponses, "confirmation");
    if (!confirmation?.approved) {
      return inputRequired({
        inputRequests: {
          confirmation: inputRequired.elicit({
            message: "Allow the conformance server to echo this message?",
            requestedSchema: {
              type: "object",
              properties: { approved: { type: "boolean", title: "Approve" } },
              required: ["approved"],
            },
          }),
        },
        requestState: "skillcanvas-conformance-round-1",
      });
    }
    return {
      content: [{ type: "text", text: message }],
      structuredContent: { echoed: message, approved: true },
    };
  });
  server.registerTool("search-evidence", {
    title: "Search evidence",
    description: "Read-only search for attributable professional knowledge and supporting evidence.",
    inputSchema: evidenceSchema,
  }, async ({ query }) => ({
    content: [{
      type: "text",
      text: `Primary documentation for ${query}: use the returned constraint only when its stated applicability conditions match the task. This evidence changes a runtime decision and is long enough for the Knowledge Compiler.`,
    }],
    structuredContent: {
      query,
      sourceUrl: "https://www.rfc-editor.org/rfc/rfc9110",
      kind: "primary-documentation",
    },
  }));
  return server;
}, { responseMode: "json", legacy: "stateless" });

export function GET(request: Request) {
  return handler.fetch(request);
}

export function POST(request: Request) {
  return handler.fetch(request);
}

export function DELETE(request: Request) {
  return handler.fetch(request);
}
