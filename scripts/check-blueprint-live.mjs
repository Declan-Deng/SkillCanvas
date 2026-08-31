// Opt-in local regression: uses the provider already authorized for a failing
// localhost request. Never reads/prints provider credentials or calls a new host.
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBlueprintPlanning } from "../app/blueprint-planner.ts";
import { repairWorkflowPlan } from "../app/workflow-plan-repair.ts";
import { HOST_FILE_WORKSPACE_CAPABILITY } from "../app/host-file-capability.ts";
import { reconcileArtifactProducerCapabilities, capabilityOwnsArtifacts } from "../app/skill-pipeline-core.ts";
import { artifactDeliveryRequested, inferArtifactPatterns, reconcileArtifactOutputContract } from "../app/generation-loop-core.ts";

const requestId = process.argv[2];
if (!requestId || process.argv[3] !== "--execute") {
  console.log("Usage: node scripts/check-blueprint-live.mjs <local diagnostic request-id> --execute [case-name] [checkpoint.json]\nRuns three real blueprint stages and DAG validation; consumes the configured model's tokens.");
  process.exit(0);
}
const db = new DatabaseSync(".wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite", { readOnly: true });
const session = db.prepare("SELECT tenant_id,provider,model FROM skillcanvas_diagnostic_events WHERE request_id=? AND event=? LIMIT 1").get(requestId, "ai_request_started");
db.close();
if (!session?.tenant_id.startsWith("local:")) throw Error("Expected an existing local request session");
const tasks = [
  { name: "source-report", idea: "根据用户提供的会议资料整理可核查的行动报告", inputs: [{ id: "material", name: "会议资料", required: true }], answers: [
    { dimension: "working-style", answer: "先提取已明确的决策和行动负责人，再起草报告，最后交付Markdown。无资料先等待用户提供。" },
    { dimension: "boundary", answer: "只在本次会话处理，不上传外部系统；缺少负责人明确标出未确定。" },
    { dimension: "bad-example", answer: "把推测当成会议已经决定的事实。" },
  ] },
  { name: "table-check", idea: "检查用户提供的CSV表格字段与计算一致性并交付可检查的报告", inputs: [{ id: "table", name: "CSV表格", required: true }], answers: [
    { dimension: "working-style", answer: "读取表格，先检查可解析性，再检查空值、重复行和用户明确提供的计算规则；输出检查报告。对未提供计算公式不得自行猜测。" },
    { dimension: "boundary", answer: "不修改原始文件，不上传第三方；没有表格时等待提供。" },
    { dimension: "output", answer: "输出Markdown检查报告，说明行列定位、发现的问题和未检查的部分。" },
  ] },
  { name: "document-tailoring", idea: "根据JD定制用户提供的简历并保留真实经历", inputs: [{ id: "jd", name: "JD", required: true }, { id: "resume", name: "简历", required: true }], answers: [
    { dimension: "working-style", answer: "先提取JD要求，再解析简历，匹配经历并起草。先生成草稿，最终交付前请我确认关键改动；收到修改意见后修订并再次确认。" },
    { dimension: "boundary", answer: "缺少JD或简历先等待输入，不自行补写虚假经历，不替我投递。" },
    { dimension: "output", answer: "完整Markdown简历、关键修改说明和JD证据对应；获最终确认后保存Markdown文件。" },
    { dimension: "bad-example", answer: "不确认就保存最终版，或捏造技能经历。" },
  ] },
];
const selected = tasks.filter((task) => !process.argv[4] || task.name === process.argv[4]);
if (!selected.length) throw Error("Unknown test case");
for (const task of selected) {
  let tokens = 0, calls = 0;
  const checkpoint = process.argv[5] ? JSON.parse(await readFile(process.argv[5], "utf8")) : {};
  const artifacts = await mkdtemp(join(tmpdir(), "ni-blueprint-live-"));
  let lastResponse;
  const call = async (mode, payload) => {
    const started = Date.now();
    const response = await fetch("http://localhost:3000/api/ai", { method: "POST", headers: { "content-type": "application/json", cookie: "skillcanvas_session=" + session.tenant_id.slice(6) }, signal: AbortSignal.timeout(110000), body: JSON.stringify({ mode, provider: session.provider, model: session.model, ...payload }) });
    const result = await response.json();
    calls += 1;
    tokens += (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0);
    console.log(JSON.stringify({ task: task.name, mode, status: response.status, requestId: result.requestId, elapsedMs: Date.now() - started, usage: result.usage, error: result.error, issues: result.issues }));
    if (!response.ok) throw Error(result.error || "Stage failed");
    lastResponse = JSON.parse(result.content);
    return lastResponse;
  };
  try {
    const result = await runBlueprintPlanning({ foundationInput: { idea: task.idea, sourceText: "仅用于通用生成器回归测试。", answers: task.answers }, planInput: { idea: task.idea, runtimeInputs: task.inputs.map((x) => ({ token: "input:" + x.id, name: x.name, required: x.required, missingBehavior: "等待用户提供真实材料" })), capabilityCatalog: [] }, modelIdentity: { provider: session.provider, model: session.model, baseUrl: "" }, checkpoint, call,
      prepareCapabilities: (plan) => {
        // Same real file-owner reconciliation used by ensureTaskCapabilities
        // in the page, before DAG planning. Do not test a fictional host with no
        // file capability when the UI automatically supplies this runtime owner.
        const description = [task.idea, ...task.answers.filter((answer) => answer.dimension === "output").map((answer) => answer.answer), plan.outputContract.format].join("；");
        const requiresArtifact = artifactDeliveryRequested(description);
        const artifactPatterns = requiresArtifact ? inferArtifactPatterns(description) : [];
        return { ...plan, items: reconcileArtifactProducerCapabilities({ capabilities: plan.items, fallback: HOST_FILE_WORKSPACE_CAPABILITY, artifactPatterns, requiresArtifact }),
          outputContract: requiresArtifact ? { ...plan.outputContract, ...reconcileArtifactOutputContract({ mode: plan.outputContract.mode, artifactPatterns, description, requiresArtifact }) } : plan.outputContract };
      },
    });
    const plan = result.capabilityPlan;
    const runtime = plan.items.filter((x) => x.enabled !== false && x.status !== "not-needed" && x.layer === "runtime" && x.kind !== "eval");
    const validated = await repairWorkflowPlan({ workflowSteps: plan.workflowSteps, capabilities: runtime, inputs: task.inputs }, (workflowRepair) => call("workflow-repair", { workflowRepair, idea: task.idea, answers: task.answers, outputContract: plan.outputContract }), (event) => console.log(JSON.stringify({ task: task.name, dag: event })));
    assert.equal(result.foundation.sections.length, 6);
    assert.ok(validated.workflowSteps.some((step) => ["persist", "deliver"].includes(step.role)));
    // Check delivery ordering as well as graph shape. These are test scenarios,
    // not domain-specific compiler logic.
    const ancestors = (step, seen = new Set()) => {
      for (const parent of validated.workflowSteps.filter((entry) => entry.produces.concat(entry.resumeProduces || []).some((token) => step.requires.includes(token)))) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        ancestors(parent, seen);
      }
      return [...seen];
    };
    const fileSteps = validated.workflowSteps.filter((entry) => entry.role === "persist" || runtime.some((owner) => entry.capabilityIds.includes(owner.id) && capabilityOwnsArtifacts(owner)));
    for (const step of fileSteps) {
      assert.ok(ancestors(step).some((entry) => entry.role === "transform"), "Saving must depend on generated content");
      assert.ok(step.delivers.some((token) => step.produces.includes(token) && !["$output", "$input_required", "$approval_required"].includes(token)), "File delivery must produce and return a real file artifact, not just a completion marker");
      if (task.name === "document-tailoring") assert.ok(ancestors(step).some((entry) => entry.role === "await-approval" && entry.resumeProduces.length), "Saving must wait for real approval");
    }
    if (task.name === "document-tailoring") assert.ok(fileSteps.length, "Requested file saving must not be omitted");
    console.log(JSON.stringify({ task: task.name, complete: true, calls, tokens, capabilities: plan.items.map(({id,kind}) => ({id,kind})), result: validated }));
  } catch (error) {
    console.log(JSON.stringify({ task: task.name, complete: false, calls, tokens, error: String(error) }));
    process.exitCode = 1;
  } finally {
    // Synthetic test artifacts only; never credentials, cookies or real user inputs.
    await writeFile(join(artifacts, "checkpoint.json"), JSON.stringify(checkpoint), { mode: 0o600 });
    await writeFile(join(artifacts, "last-response.json"), JSON.stringify(lastResponse ?? null), { mode: 0o600 });
    console.log(JSON.stringify({ task: task.name, artifacts }));
  }
}
