#!/usr/bin/env node

/**
 * Probe DeepSeek's current server-side web-search support without exposing the
 * API key. It tests both the OpenAI Responses wire format and the Anthropic
 * Messages wire format, then prints only capability evidence and short text
 * previews—not the full upstream payload.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=... pnpm probe:deepseek-search
 *   DEEPSEEK_API_KEY=... pnpm probe:deepseek-search -- "your search question"
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let apiKey = (process.env.DEEPSEEK_API_KEY || process.env.SKILLCANVAS_SHARED_API_KEY || "").trim();
let baseUrl = (process.env.DEEPSEEK_BASE_URL || process.env.SKILLCANVAS_SHARED_BASE_URL || "https://api.deepseek.com")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/anthropic$/i, "");
let model = (process.env.DEEPSEEK_MODEL || process.env.SKILLCANVAS_SHARED_MODEL || "deepseek-flash").trim();
const query = process.argv.slice(2).join(" ").trim()
  || "Search the web for the current DeepSeek API documentation about built-in web search. Return the official source URL and a one-sentence conclusion.";
const protocolFilter = (process.env.DEEPSEEK_PROBE_PROTOCOL || "both").trim().toLowerCase();

function base64Bytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function decryptLocalCredential(payload, secret) {
  try {
    const [iv, encrypted] = payload.split(".");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64Bytes(iv) }, key, base64Bytes(encrypted));
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}

async function latestLocalDeepseekCredential() {
  const secretPath = resolve(".wrangler/skillcanvas-vault-key");
  const databaseDirectory = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  if (!existsSync(secretPath) || !existsSync(databaseDirectory)) return null;
  const secret = readFileSync(secretPath, "utf8").trim();
  const rows = [];
  for (const filename of readdirSync(databaseDirectory).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")) {
    let database;
    try {
      database = new DatabaseSync(resolve(databaseDirectory, filename), { readOnly: true });
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='skillcanvas_credential_vault'").all();
      if (!tables.length) continue;
      rows.push(...database.prepare("SELECT encrypted_payload, updated_at FROM skillcanvas_credential_vault ORDER BY updated_at DESC").all());
    } catch {
      // Ignore unrelated or incompatible local Miniflare databases.
    } finally {
      database?.close();
    }
  }
  for (const row of rows.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))) {
    const credential = await decryptLocalCredential(String(row.encrypted_payload || ""), secret);
    if (credential?.provider === "deepseek" && typeof credential.apiKey === "string" && credential.apiKey.length >= 9) return credential;
  }
  return null;
}

if (!apiKey) {
  const localCredential = await latestLocalDeepseekCredential();
  if (localCredential) {
    apiKey = localCredential.apiKey.trim();
    baseUrl = String(localCredential.baseUrl || baseUrl).trim().replace(/\/+$/, "").replace(/\/anthropic$/i, "");
    model = String(localCredential.model || model).trim();
    console.log("Using the most recent encrypted DeepSeek credential from the local SkillCanvas vault.");
  }
}

if (!apiKey) {
  console.error("Missing a local DeepSeek credential and DEEPSEEK_API_KEY. The probe never stores or prints the key.");
  process.exit(1);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

function summarizePayload(payload) {
  const types = [];
  const urls = [];
  const text = [];
  walk(payload, (item) => {
    if (typeof item.type === "string") types.push(item.type);
    if (typeof item.url === "string" && /^https?:\/\//i.test(item.url)) urls.push(item.url);
    if (typeof item.text === "string") text.push(item.text);
    if (typeof item.output_text === "string") text.push(item.output_text);
  });
  return {
    itemTypes: unique(types),
    urls: unique(urls).slice(0, 12),
    textPreview: text.join("\n").replace(/\s+/g, " ").trim().slice(0, 500),
  };
}

async function postJson(url, headers, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { parseError: "Upstream returned non-JSON content", preview: raw.slice(0, 300) };
    }
    return { ok: response.ok, status: response.status, elapsedMs: Date.now() - startedAt, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeResponses() {
  const result = await postJson(`${baseUrl}/responses`, {
    Authorization: `Bearer ${apiKey}`,
  }, {
    model,
    input: query,
    max_output_tokens: 1200,
    tools: [{ type: "web_search" }],
  });
  const summary = summarizePayload(result.payload);
  const output = Array.isArray(result.payload?.output) ? result.payload.output : [];
  const outputTypes = output.flatMap((item) => item && typeof item === "object" && typeof item.type === "string" ? [item.type] : []);
  // Do not inspect the whole response here: Responses payloads may echo the
  // requested tool definition even when the model never invoked it.
  const searchTypes = outputTypes.filter((type) => type === "web_search_call" || type.startsWith("web_search_call."));
  return {
    protocol: "OpenAI Responses",
    endpoint: `${baseUrl}/responses`,
    httpStatus: result.status,
    elapsedMs: result.elapsedMs,
    searchExecuted: searchTypes.length > 0,
    searchEventTypes: searchTypes,
    outputItemTypes: outputTypes,
    stopReason: String(result.payload?.status || ""),
    sourceUrls: summary.urls,
    textPreview: summary.textPreview,
    error: result.ok ? "" : String(result.payload?.error?.message || result.payload?.message || "Request failed").slice(0, 500),
  };
}

async function probeAnthropic() {
  const result = await postJson(`${baseUrl}/anthropic/v1/messages`, {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  }, {
    model,
    max_tokens: 1200,
    messages: [{ role: "user", content: query }],
    tools: [{
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 2,
      allowed_domains: ["api-docs.deepseek.com"],
    }],
  });
  const summary = summarizePayload(result.payload);
  const content = Array.isArray(result.payload?.content) ? result.payload.content : [];
  const contentTypes = content.flatMap((item) => item && typeof item === "object" && typeof item.type === "string" ? [item.type] : []);
  const searchTypes = summary.itemTypes.filter((type) => type === "server_tool_use" || type === "web_search_tool_result" || type === "web_search_result");
  return {
    protocol: "Anthropic Messages",
    endpoint: `${baseUrl}/anthropic/v1/messages`,
    httpStatus: result.status,
    elapsedMs: result.elapsedMs,
    searchExecuted: searchTypes.length > 0,
    searchEventTypes: searchTypes,
    outputItemTypes: contentTypes,
    stopReason: String(result.payload?.stop_reason || ""),
    sourceUrls: summary.urls,
    textPreview: summary.textPreview,
    error: result.ok ? "" : String(result.payload?.error?.message || result.payload?.message || "Request failed").slice(0, 500),
  };
}

function printResult(result) {
  console.log(`\n${result.protocol}`);
  console.log(`  endpoint: ${result.endpoint}`);
  console.log(`  HTTP: ${result.httpStatus} (${result.elapsedMs} ms)`);
  console.log(`  server-side search observed: ${result.searchExecuted ? "YES" : "NO"}`);
  console.log(`  search item types: ${result.searchEventTypes.join(", ") || "none"}`);
  console.log(`  output item types: ${result.outputItemTypes.join(", ") || "none"}`);
  console.log(`  stop reason: ${result.stopReason || "none"}`);
  console.log(`  source URLs: ${result.sourceUrls.length ? result.sourceUrls.join("\n    ") : "none"}`);
  if (result.textPreview) console.log(`  text preview: ${result.textPreview}`);
  if (result.error) console.log(`  error: ${result.error}`);
}

console.log(`DeepSeek web-search capability probe\nmodel: ${model}\nquery: ${query}`);

const selectedProbes = protocolFilter === "responses"
  ? [probeResponses]
  : protocolFilter === "anthropic"
    ? [probeAnthropic]
    : [probeResponses, probeAnthropic];
const results = [];
for (const probe of selectedProbes) {
  try {
    const result = await probe();
    results.push(result);
    printResult(result);
  } catch (error) {
    const result = {
      protocol: probe === probeResponses ? "OpenAI Responses" : "Anthropic Messages",
      endpoint: "",
      httpStatus: 0,
      elapsedMs: 0,
      searchExecuted: false,
      searchEventTypes: [],
      outputItemTypes: [],
      stopReason: "",
      sourceUrls: [],
      textPreview: "",
      error: error instanceof Error && error.name === "AbortError" ? "Timed out after 90 seconds" : error instanceof Error ? error.message : "Unknown error",
    };
    results.push(result);
    printResult(result);
  }
}

const supported = results.filter((result) => result.searchExecuted);
console.log("\nConclusion");
if (supported.length) {
  console.log(`  Server-side web search was observed on: ${supported.map((item) => item.protocol).join(", ")}.`);
} else {
  console.log("  Neither protocol returned evidence of a server-side web-search call.");
}
console.log("  A normal text answer without web-search item types does not count as search support.");
