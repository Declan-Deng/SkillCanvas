import { REQUIRED_KNOWLEDGE_CATEGORIES, normalizeKnowledgePack, type KnowledgeCategory, type KnowledgePack, type KnowledgePlan, type RetrievedKnowledgeSource } from "./knowledge-research.ts";

// Share the retry budget with the browser. The individual attempt deadline
// stays unchanged; the browser must allow both attempts to finish.
export function knowledgeAttemptTimeout(provider: string, attempt: number) {
  return provider === "compatible" ? (attempt === 1 ? 52_000 : 44_000) : 42_000;
}

export function knowledgeClientTimeout(provider: string) {
  return knowledgeAttemptTimeout(provider, 1) + knowledgeAttemptTimeout(provider, 2) + 12_000;
}

type CompileBatch = { categories: KnowledgeCategory[]; raw: unknown };
export type KnowledgeCompileCheckpoint = { completed: Record<string, CompileBatch>; split: string[] };

/** Limit each response's scope, not the evidence or user's requirements.
 * Only a failed pair is split into singles; completed work is never replayed.
 * The caller still validates citations, delta relevance and category coverage.
 */
export async function compileKnowledgeBatches(input: {
  payload: Record<string, unknown>;
  checkpoint?: KnowledgeCompileCheckpoint;
  call: (payload: Record<string, unknown>) => Promise<unknown>;
  onBatch: (batch: CompileBatch) => Promise<void>;
}) {
  const checkpoint = input.checkpoint ?? { completed: {}, split: [] };
  const failures: string[] = [];
  const visit = async (categories: KnowledgeCategory[]): Promise<void> => {
    const key = categories.join("+");
    if (checkpoint.split.includes(key)) {
      for (const category of categories) await visit([category]);
      return;
    }
    try {
      const batch = checkpoint.completed[key] ?? {
        categories,
        raw: await input.call({ ...input.payload, knowledgeBatch: { categories } }),
      };
      // A parseable envelope is required before checkpointing. Never salvage
      // truncated JSON or silently treat a missing atoms array as no knowledge.
      if (!batch.raw || typeof batch.raw !== "object" || !Array.isArray((batch.raw as Record<string, unknown>).atoms)) {
        throw Object.assign(new Error("专业规则批次缺少完整 atoms 结构"), { code: "AI_INVALID_JSON" });
      }
      checkpoint.completed[key] = batch;
      await input.onBatch(batch);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      if (categories.length > 1 && ["AI_OUTPUT_TRUNCATED", "AI_INVALID_JSON"].includes(String(code))) {
        checkpoint.split.push(key);
        for (const category of categories) await visit([category]);
      } else {
        failures.push(`${key}: ${error instanceof Error ? error.message : "编译未完成"}`);
      }
    }
  };
  for (let offset = 0; offset < REQUIRED_KNOWLEDGE_CATEGORIES.length; offset += 2) {
    await visit(REQUIRED_KNOWLEDGE_CATEGORIES.slice(offset, offset + 2));
  }
  return { checkpoint, failures };
}

/** Retrieval and compilation are separate outcomes. Keep source receipts and
 * previously verified rules even if a later model call fails. */
export function retainKnowledgeFailure(plan: KnowledgePlan, sources: RetrievedKnowledgeSource[], issue: string, retained?: KnowledgePack): KnowledgePack {
  const pack = retained ?? normalizeKnowledgePack({ raw: { atoms: [] }, plan, sources });
  return {
    ...pack, sources, status: pack.atoms.length ? "partial" : "error",
    sufficiency: "insufficient",
    summary: sources.length
      ? `已读取 ${sources.length} 个来源，已保留 ${pack.atoms.length} 条核验规则；知识编译未全部完成：${issue}。不会把未核验内容当作专业规则。`
      : `${issue}；未取得可核验来源，不会用模型常识冒充专业知识。`,
  };
}
