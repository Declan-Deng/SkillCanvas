import { deleteServerCredentials, readServerCredentialState, readServerCredentials, saveServerCredentials, tenantContext, type ServerCredentialConfig } from "../../server-data";
import { checkRequestRate } from "../../request-guard";

function withSession(tenant: ReturnType<typeof tenantContext>, payload: unknown, status = 200) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (tenant.setCookie) headers.set("Set-Cookie", tenant.setCookie);
  return Response.json(payload, { status, headers });
}

export async function GET(request: Request) {
  const tenant = tenantContext(request);
  const state = await readServerCredentialState(tenant.tenantId);
  const stored = state.config;
  return withSession(tenant, {
    configured: Boolean(stored?.apiKey),
    researchConfigured: Boolean(stored?.researchApiKey) || stored?.researchProvider === "searxng",
    managed: state.managed,
    researchManaged: state.researchManaged,
    config: stored ? { ...stored, apiKey: undefined, researchApiKey: undefined } : null,
  });
}

export async function POST(request: Request) {
  const tenant = tenantContext(request);
  const rate = checkRequestRate(`${tenant.tenantId}:credentials`, 12);
  if (!rate.allowed) return withSession(tenant, { error: "设置保存过于频繁，请稍后重试" }, 429);
  const body = await request.json() as Partial<ServerCredentialConfig>;
  const state = await readServerCredentialState(tenant.tenantId);
  if (state.managed && state.config) {
    return withSession(tenant, {
      ok: true,
      configured: true,
      researchConfigured: state.researchManaged,
      managed: true,
      researchManaged: state.researchManaged,
    });
  }
  const stored = await readServerCredentials(tenant.tenantId);
  if (!(["deepseek", "openai", "compatible"] as string[]).includes(String(body.provider))) return withSession(tenant, { error: "不支持的模型服务" }, 400);
  const provider = body.provider as ServerCredentialConfig["provider"];
  const suppliedApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = suppliedApiKey || (stored?.provider === provider ? stored.apiKey : "");
  if (apiKey.length < 9) {
    return withSession(tenant, {
      error: stored && stored.provider !== provider
        ? "切换模型服务后需要输入对应的新 API Key"
        : "请输入有效的模型 API Key",
    }, 400);
  }
  const researchProvider = (["disabled", "firecrawl", "searxng"] as string[]).includes(String(body.researchProvider))
    ? body.researchProvider as ServerCredentialConfig["researchProvider"]
    : stored?.researchProvider || "disabled";
  const suppliedResearchKey = typeof body.researchApiKey === "string" ? body.researchApiKey.trim() : "";
  const researchApiKey = suppliedResearchKey
    || (stored?.researchProvider === researchProvider ? stored.researchApiKey : "");
  if (researchProvider === "firecrawl" && researchApiKey.length < 8) {
    return withSession(tenant, { error: "请输入有效的 Firecrawl API Key" }, 400);
  }
  const value: ServerCredentialConfig = {
    provider,
    model: String(body.model || stored?.model || "").slice(0, 120),
    baseUrl: String(body.baseUrl || stored?.baseUrl || "").slice(0, 500),
    apiKey: apiKey.slice(0, 512),
    researchProvider,
    researchApiKey: researchApiKey.slice(0, 512),
    researchBaseUrl: String(body.researchBaseUrl || (stored?.researchProvider === researchProvider ? stored.researchBaseUrl : "") || "").trim().slice(0, 500),
  };
  await saveServerCredentials(tenant.tenantId, value);
  return withSession(tenant, { ok: true, configured: true, researchConfigured: Boolean(value.researchApiKey) || value.researchProvider === "searxng" });
}

export async function DELETE(request: Request) {
  const tenant = tenantContext(request);
  const rate = checkRequestRate(`${tenant.tenantId}:credentials`, 12);
  if (!rate.allowed) return withSession(tenant, { error: "操作过于频繁，请稍后重试" }, 429);
  await deleteServerCredentials(tenant.tenantId);
  const state = await readServerCredentialState(tenant.tenantId);
  return withSession(tenant, { ok: true, managed: state.managed, configured: Boolean(state.config?.apiKey), researchConfigured: state.researchManaged });
}
