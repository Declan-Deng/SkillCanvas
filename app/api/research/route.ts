import { dedupeResearchSources, htmlToEvidenceText, parseDeepseekWebSearchResults, parseFirecrawlResults, parseSearxngResults, safeResearchUrl } from "../../research-core";
import { classifyKnowledgeSourceAuthority, type ResearchProviderId, type RetrievedKnowledgeSource } from "../../knowledge-research";
import { readServerCredentialState, tenantContext } from "../../server-data";
import { checkRequestRate } from "../../request-guard";

type RequestBody = {
  action?: "test";
  provider?: ResearchProviderId;
  apiKey?: string;
  baseUrl?: string;
  modelApiKey?: string;
  modelProvider?: string;
  model?: string;
  preferredDomains?: unknown;
  queries?: unknown;
};

function researchBase(provider: ResearchProviderId, raw: string) {
  const fallback = provider === "firecrawl" ? "https://api.firecrawl.dev" : "";
  const allowLoopback = provider === "searxng" && process.env.NODE_ENV !== "production";
  const url = safeResearchUrl(raw.trim() || fallback, { allowLoopback });
  if (!url) throw new Error(provider === "searxng" ? "SearXNG 地址无效；生产环境必须使用公开 HTTPS 地址" : "联网研究服务地址无效");
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 18_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function collectSearchBatches(settled: PromiseSettledResult<RetrievedKnowledgeSource[]>[], provider: string) {
  const sources = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const failures = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (!sources.length && failures.length) {
    // Don't turn authentication/quota/network failures into "no knowledge".
    // Expose safe classifications only, never upstream bodies or credentials.
    const reasons = [...new Set(failures.map(({ reason }) => {
      const status = String(reason?.message || "").match(/检索失败（(\d{3})）/)?.[1];
      if (status === "401" || status === "403") return `HTTP ${status}：请检查检索服务的授权`;
      if (status === "402") return "HTTP 402：检索服务额度不足";
      if (status === "429") return "HTTP 429：检索服务限流";
      if (status) return `HTTP ${status}：检索服务请求失败`;
      if (reason?.name === "AbortError") return "检索请求超时";
      if (reason instanceof SyntaxError) return "检索服务返回了无效 JSON";
      return "检索服务网络连接失败";
    }))];
    throw new Error(`${provider} 的 ${failures.length}/${settled.length} 个检索请求失败：${reasons.join("；")}。这是服务故障，不代表该领域没有专业知识。`);
  }
  return sources;
}

async function fetchEvidencePage(source: RetrievedKnowledgeSource) {
  let current = safeResearchUrl(source.url);
  if (!current) return source;
  for (let redirect = 0; redirect <= 2; redirect += 1) {
    try {
      const response = await fetchWithTimeout(current.toString(), {
        redirect: "manual",
        headers: { Accept: "text/html, text/plain;q=0.9", "User-Agent": "SkillCanvasKnowledgeCompiler/1.0" },
      }, 10_000);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return source;
        current = safeResearchUrl(new URL(location, current).toString());
        if (!current) return source;
        continue;
      }
      if (!response.ok) return source;
      const contentType = response.headers.get("content-type") || "";
      const contentLength = Number(response.headers.get("content-length") || "0");
      if (contentLength > 2_000_000 || !/(?:text\/html|text\/plain|application\/xhtml\+xml)/i.test(contentType)) return source;
      const raw = (await response.text()).slice(0, 1_200_000);
      const evidence = contentType.includes("html") ? htmlToEvidenceText(raw) : raw.replace(/\s+/g, " ").trim().slice(0, 16_000);
      return evidence.length > source.excerpt.length ? { ...source, excerpt: evidence, url: current.toString() } : source;
    } catch {
      return source;
    }
  }
  return source;
}

async function searchFirecrawl(baseUrl: string, apiKey: string, queries: string[], limit = 5) {
  if (apiKey.trim().length < 8) throw new Error("Firecrawl API Key 未配置");
  const retrievedAt = new Date().toISOString();
  const settled = await Promise.allSettled(queries.map(async (query) => {
    const response = await fetchWithTimeout(`${baseUrl}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({ query, limit, sources: ["web"], scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }),
    }, 24_000);
    const raw = await response.text();
    if (!response.ok) throw new Error(`Firecrawl 检索失败（${response.status}）`);
    return parseFirecrawlResults(JSON.parse(raw), query, retrievedAt);
  }));
  return dedupeResearchSources(collectSearchBatches(settled, "Firecrawl"));
}

async function searchSearxng(baseUrl: string, queries: string[]) {
  const retrievedAt = new Date().toISOString();
  const settled = await Promise.allSettled(queries.map(async (query) => {
    const endpoint = new URL(`${baseUrl}/search`);
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("safesearch", "1");
    const response = await fetchWithTimeout(endpoint.toString(), { headers: { Accept: "application/json" } });
    const raw = await response.text();
    if (!response.ok) throw new Error(`SearXNG 检索失败（${response.status}）`);
    return parseSearxngResults(JSON.parse(raw), query, retrievedAt).slice(0, 5);
  }));
  const discovered = dedupeResearchSources(collectSearchBatches(settled, "SearXNG"), 8);
  return dedupeResearchSources(await Promise.all(discovered.map(fetchEvidencePage)));
}

function normalizePreferredDomains(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const raw = item.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw) ? [raw] : [];
  }))).slice(0, 10);
}

function domainMatches(url: string, domains: string[]) {
  if (!domains.length) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function searchDeepseek(apiKey: string, model: string, queries: string[], preferredDomains: string[]) {
  if (apiKey.trim().length < 9) throw new Error("DeepSeek API Key 未配置");
  if (!model.trim()) throw new Error("DeepSeek 模型未配置");
  const retrievedAt = new Date().toISOString();
  const settled = await Promise.allSettled(queries.map(async (query) => {
    const domainInstruction = preferredDomains.length
      ? ` Prefer primary sources from these domains when relevant: ${preferredDomains.join(", ")}.`
      : " Prefer official and primary sources.";
    const response = await fetchWithTimeout("https://api.deepseek.com/anthropic/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model.trim().slice(0, 120),
        max_tokens: 1_200,
        messages: [{
          role: "user",
          content: `You must use web_search to find current, attributable evidence for this research question: ${query}.${domainInstruction} Do not answer from memory.`,
        }],
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 1,
          ...(preferredDomains.length ? { allowed_domains: preferredDomains } : {}),
        }],
      }),
    }, 32_000);
    const raw = await response.text();
    if (!response.ok) throw new Error(`DeepSeek 检索失败（${response.status}）`);
    const discovered = parseDeepseekWebSearchResults(JSON.parse(raw), query).slice(0, 6);
    const seeds: RetrievedKnowledgeSource[] = discovered.map((item, index) => {
      const authority = classifyKnowledgeSourceAuthority(item.url, item.title);
      return {
        id: `deepseek-${index + 1}`,
        query: item.query,
        title: item.title,
        url: item.url,
        // Discovery text is intentionally unusable as compiled evidence. The
        // source survives only if fetchEvidencePage replaces it with page text.
        excerpt: `DeepSeek web-search discovery: ${item.title}`,
        publishedAt: item.publishedAt,
        retrievedAt,
        authorityTier: authority.tier,
        authorityReason: authority.reason,
      };
    });
    const fetched = await Promise.all(seeds.map(fetchEvidencePage));
    return fetched.filter((item) => !item.excerpt.startsWith("DeepSeek web-search discovery:") && item.excerpt.length >= 120);
  }));
  const sources = collectSearchBatches(settled, "DeepSeek 联网搜索");
  const preferredUrls = sources.filter((item) => domainMatches(item.url, preferredDomains)).map((item) => item.url);
  return dedupeResearchSources(sources, 12, preferredUrls);
}

export async function POST(request: Request) {
  try {
    const tenant = tenantContext(request);
    const rate = checkRequestRate(`${tenant.tenantId}:research`, 12);
    if (!rate.allowed) return Response.json({ error: `检索请求过于频繁，请 ${rate.retryAfterSeconds} 秒后重试` }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const body = await request.json() as RequestBody;
    const credentialState = await readServerCredentialState(tenant.tenantId);
    const stored = credentialState.config;
    const requestedProvider = body.provider;
    const provider: ResearchProviderId = credentialState.researchManaged
      ? requestedProvider === "deepseek" && stored?.provider === "deepseek"
        ? "deepseek"
        : requestedProvider === stored?.researchProvider
          ? requestedProvider
          : stored?.researchProvider || "disabled"
      : requestedProvider || stored?.researchProvider || "disabled";
    if (!(["firecrawl", "searxng", "deepseek"] as ResearchProviderId[]).includes(provider)) return Response.json({ error: "尚未配置可用的专业知识联网服务" }, { status: 400 });
    const queries = body.action === "test" ? [provider === "deepseek" ? "DeepSeek API official documentation" : "Firecrawl search documentation"] : Array.isArray(body.queries)
      ? Array.from(new Set(body.queries.filter((item): item is string => typeof item === "string").map((item) => item.replace(/\s+/g, " ").trim().slice(0, 180)).filter(Boolean))).slice(0, 4)
      : [];
    if (!queries.length) return Response.json({ error: "没有可执行的专业知识检索问题" }, { status: 400 });
    const preferredDomains = normalizePreferredDomains(body.preferredDomains);
    let sources: RetrievedKnowledgeSource[];
    if (provider === "deepseek") {
      const modelProvider = credentialState.managed ? stored?.provider : body.modelProvider || stored?.provider;
      if (modelProvider !== "deepseek") return Response.json({ error: "DeepSeek 联网搜索需要使用已配置的 DeepSeek 模型服务" }, { status: 400 });
      const modelApiKey = credentialState.managed
        ? stored?.apiKey || ""
        : typeof body.modelApiKey === "string" && body.modelApiKey.trim()
          ? body.modelApiKey
          : stored?.apiKey || "";
      const model = credentialState.managed ? stored?.model || "" : typeof body.model === "string" && body.model.trim() ? body.model : stored?.model || "";
      sources = await searchDeepseek(modelApiKey, model, queries, preferredDomains);
    } else {
      const baseUrl = researchBase(provider, credentialState.researchManaged ? stored?.researchBaseUrl || "" : typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl : stored?.researchBaseUrl || "");
      sources = provider === "firecrawl"
        ? await searchFirecrawl(baseUrl, credentialState.researchManaged ? stored?.researchApiKey || "" : typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey : stored?.researchApiKey || "", queries, body.action === "test" ? 1 : 5)
        : await searchSearxng(baseUrl, queries);
    }
    if (!sources.length) return Response.json({ error: "联网服务没有返回可用于编译专业知识的正文证据" }, { status: 502 });
    return Response.json(body.action === "test" ? { ok: true, sourceCount: sources.length } : { sources });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "专业知识检索超时" : error instanceof Error ? error.message : "专业知识检索失败";
    return Response.json({ error: message }, { status: 502 });
  }
}
