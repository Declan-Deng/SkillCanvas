import { auditSkillIRFiles } from "./skill-ir.ts";

export type BundleIssuePriority = "P0" | "P1";
export type BundleIssueCategory = "P0_EXECUTION_BLOCKER" | "P1_CONTRACT_BLOCKER";
export type BundleRepairRoute = "static-execution" | "semantic-contract";

export type BundleStaticIssue = {
  priority: BundleIssuePriority;
  category: BundleIssueCategory;
  detector: "deterministic";
  repairRoute: BundleRepairRoute;
  code: string;
  path: string;
  message: string;
};

export type BundleStaticCheck = {
  id: string;
  label: string;
  passed: boolean;
};

export type BundleStaticValidation = {
  valid: boolean;
  executionReady: boolean;
  contractReady: boolean;
  issues: BundleStaticIssue[];
  checks: BundleStaticCheck[];
};

const REQUIRED_HARNESS = [
  "evals/capability-manifest.json",
  "evals/evals.json",
  "evals/graders.json",
  "evals/result.schema.json",
  "evals/run_evals.py",
  "evals/artifact_checker.py",
];

const RUNTIME_FILE_REFERENCE = /\b(?:references|scripts|assets|integrations)\/[A-Za-z0-9_./-]+\.(?:md|json|py|sh|csv|tsv|txt|ya?ml|html|xlsx?)\b/g;
const ASK_FIRST_SIGNAL = /(?:先|必须|需要|应当|务必).{0,10}(?:询问|追问|确认|征求)|(?:等待|暂停|停止).{0,12}(?:用户|确认|回复|输入)|(?:ask|confirm|wait for).{0,16}(?:user|approval|input)/i;
const AUTONOMOUS_SIGNAL = /(?:自主|自动|直接|无需确认|不必询问|不用询问|默认).{0,12}(?:推进|继续|执行|完成|处理|补全|决定)|(?:proceed|continue|execute|complete).{0,12}(?:autonomously|without confirmation|without asking)/i;
const SCOPED_AUTONOMY_SIGNAL = /(?:低风险|非关键|可逆).{0,80}(?:关键|高风险|不可逆)|(?:关键|高风险|不可逆).{0,80}(?:低风险|非关键|可逆)|(?:除非|仅当|只有|否则|分别|根据.{0,12}(?:风险|情况|条件))/i;
const PROMPT_TEMPLATE_SIGNAL = /(?:相邻任务|complete the task|do the task|待替换|在此(?:填写|输入)|placeholder|示例任务(?:\s*\d+)?)/i;
const GENERIC_INPUT_SIGNAL = /^(?:用户)?(?:补充|其他|相关|必要|更多|通用)?(?:的)?(?:输入|信息|资料|内容|上下文|材料)$/i;

// Detection method and failure severity are separate dimensions. Everything in
// this validator is deterministic, but only failures that prevent the bundle
// from loading or executing belong to P0. Deterministic contract defects are P1
// and must be routed to semantic repair instead of the static repair loop.
const P0_EXECUTION_BLOCKER_CODES = new Set([
  "INVALID_BUNDLE_PATH",
  "EMPTY_REQUIRED_FILE",
  "MISSING_REQUIRED_FILE",
  "INVALID_SKILL_FRONTMATTER",
  "INVALID_YAML",
  "INVALID_JSON",
  "INVALID_JSON_SCHEMA",
  "MISSING_REFERENCED_FILE",
  "EVAL_RUNNER_START_CONTRACT",
  "INVALID_HARNESS_FILE",
  "PYTHON_COMPILE_ERROR",
  "SHELL_SYNTAX_ERROR",
  "PYTHON_TEST_FAILURE",
  "STATIC_VALIDATOR_UNAVAILABLE",
]);

export function classifyBundleIssue(code: string): Pick<BundleStaticIssue, "priority" | "category" | "detector" | "repairRoute"> {
  const executionBlocker = P0_EXECUTION_BLOCKER_CODES.has(code);
  return executionBlocker
    ? { priority: "P0", category: "P0_EXECUTION_BLOCKER", detector: "deterministic", repairRoute: "static-execution" }
    : { priority: "P1", category: "P1_CONTRACT_BLOCKER", detector: "deterministic", repairRoute: "semantic-contract" };
}

function safeBundlePath(path: string) {
  return path.length > 0
    && path.length <= 180
    && !path.startsWith("/")
    && !path.includes("\\")
    && !path.split("/").includes("..")
    && /^[A-Za-z0-9._/-]+$/.test(path)
    && !path.endsWith("/");
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.filter(Boolean).forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}

function pushIssue(issues: BundleStaticIssue[], code: string, path: string, message: string) {
  issues.push({ ...classifyBundleIssue(code), code, path, message });
}

function validateSkillFrontmatter(skill: string, issues: BundleStaticIssue[]) {
  const match = skill.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) {
    pushIssue(issues, "INVALID_SKILL_FRONTMATTER", "SKILL.md", "SKILL.md 缺少可解析的顶部 frontmatter");
    return;
  }
  const lines = match[1].split("\n").map((line) => line.trim()).filter(Boolean);
  const fields = lines.map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/)).filter(Boolean) as RegExpMatchArray[];
  const keys = fields.map((item) => item[1]);
  if (fields.length !== lines.length || !keys.includes("name") || !keys.includes("description")) {
    pushIssue(issues, "INVALID_SKILL_FRONTMATTER", "SKILL.md", "SKILL.md frontmatter 必须包含可解析的 name 与 description");
  }
  const extras = keys.filter((key) => !["name", "description"].includes(key));
  if (extras.length) pushIssue(issues, "INVALID_SKILL_FRONTMATTER", "SKILL.md", `SKILL.md frontmatter 含不允许的字段：${extras.join("、")}`);
}

function validateRequiredSections(skill: string, issues: BundleStaticIssue[]) {
  const body = skill.replace(/^---\s*\n[\s\S]*?\n---(?:\s*\n|$)/, "");
  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  const required = /^(?:goal|workflow|runtime workflow|quality check|quality checks|verification|boundary|boundaries|目标|工作流|运行流程|质量检查|验证|边界)$/i;
  headings.forEach((heading, index) => {
    const title = heading[1].trim();
    if (!required.test(title)) return;
    const start = (heading.index || 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    const content = body.slice(start, end).replace(/<!--[\s\S]*?-->/g, "").replace(/[-*_`>#\s]/g, "").trim();
    if (content.length < 8 || /^(?:待补充|todo|tbd|none|n\/a)$/i.test(content)) pushIssue(issues, "EMPTY_REQUIRED_SECTION", "SKILL.md", `主文件中的“${title}”章节为空或仍是占位内容`);
  });
}

function validateInterfaceYaml(value: string, issues: BundleStaticIssue[]) {
  if (/\t/.test(value) || !/^interface:\s*$/m.test(value)) {
    pushIssue(issues, "INVALID_YAML", "agents/openai.yaml", "agents/openai.yaml 不是可解析的 interface YAML");
    return;
  }
  for (const field of ["display_name", "short_description", "default_prompt"]) {
    const match = value.match(new RegExp(`^\\s{2}${field}:\\s*(.+)$`, "m"));
    if (!match) {
      pushIssue(issues, "INVALID_YAML", "agents/openai.yaml", `agents/openai.yaml 缺少 ${field}`);
      continue;
    }
    try {
      if (typeof JSON.parse(match[1]) !== "string") throw new Error("not string");
    } catch {
      pushIssue(issues, "INVALID_YAML", "agents/openai.yaml", `agents/openai.yaml 的 ${field} 必须是有效的双引号字符串`);
    }
  }
}

function validateManifestDuplicates(raw: unknown, issues: BundleStaticIssue[]) {
  if (!raw || typeof raw !== "object") return;
  const manifest = raw as Record<string, unknown>;
  const duplicateField = (items: unknown, field: string, label: string) => {
    if (!Array.isArray(items)) return;
    const duplicates = duplicateValues(items.map((item) => item && typeof item === "object" ? String((item as Record<string, unknown>)[field] || "") : ""));
    if (duplicates.length) pushIssue(issues, "DUPLICATE_MANIFEST_ENTRY", "evals/capability-manifest.json", `${label}存在重复标识：${duplicates.join("、")}`);
  };
  duplicateField(manifest.capabilities, "id", "能力清单");
  duplicateField(manifest.coverage, "requirement_id", "能力覆盖关系");
  const layers = manifest.artifact_layers && typeof manifest.artifact_layers === "object" ? manifest.artifact_layers as Record<string, unknown> : {};
  Object.entries(layers).forEach(([layer, values]) => {
    if (!Array.isArray(values)) return;
    const duplicates = duplicateValues(values.filter((item): item is string => typeof item === "string"));
    if (duplicates.length) pushIssue(issues, "DUPLICATE_MANIFEST_ENTRY", "evals/capability-manifest.json", `${layer} 产物层重复声明：${duplicates.join("、")}`);
  });
}

function markdownContractUnits(content: string) {
  return content.split("\n").flatMap((line, lineIndex) => {
    if (/^\s*#{1,6}\s/.test(line)) return [];
    return line
      .replace(/^\s*(?:[-*+]\s+|\d+[.)、]\s*)/, "")
      .split(/(?<=[。！？!?])\s*/)
      .map((text) => ({ text: text.trim(), line: lineIndex + 1 }))
      .filter((item) => item.text.length >= 6);
  });
}

function jsonContractUnits(value: unknown, prefix = "root"): Array<{ key: string; text: string }> {
  if (Array.isArray(value)) return value.flatMap((item, index) => jsonContractUnits(item, `${prefix}[${index}]`));
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const units: Array<{ key: string; text: string }> = [];
  Object.entries(object).forEach(([key, child]) => {
    if (typeof child === "string" && /(?:behavior|condition|action|fallback|resolution|stop|workflow|permission|constraint|boundary|policy)/i.test(key)) {
      units.push({ key: `${prefix}.${key}`, text: child });
    } else if (child && typeof child === "object") {
      units.push(...jsonContractUnits(child, `${prefix}.${key}`));
    }
  });
  const contractKeys = ["missingBehavior", "action", "stopOrRedirect", "fallback", "routingCondition", "activationCondition"];
  const contractText = contractKeys.map((key) => typeof object[key] === "string" ? object[key] : "").filter(Boolean).join("；");
  const resolution = object.resolution && typeof object.resolution === "object" ? object.resolution as Record<string, unknown> : null;
  const resolutionText = resolution
    ? [resolution.mode === "ask" ? "必须先询问用户确认" : "", resolution.stopCondition, resolution.markProvisional === true ? "可自主继续并标注" : ""].filter(Boolean).join("；")
    : "";
  if (contractText || resolutionText) units.push({ key: prefix, text: `${contractText}；${resolutionText}` });
  return units;
}

function normalizeSentence(value: string) {
  return value
    .toLowerCase()
    .replace(/^\s*(?:[-*+]\s+|\d+[.)、]\s*)/, "")
    .replace(/[\s`*_>#“”"'。，、；：:!?！？()（）\[\]{}-]+/g, "")
    .trim();
}

function validateContentPermissionCoherence(files: Record<string, string>, issues: BundleStaticIssue[]) {
  const runtimeFiles = Object.entries(files).filter(([path]) => path === "SKILL.md" || /^references\/.*\.(?:md|txt)$/i.test(path));
  runtimeFiles.forEach(([path, content]) => {
    markdownContractUnits(content).forEach((unit) => {
      if (ASK_FIRST_SIGNAL.test(unit.text) && AUTONOMOUS_SIGNAL.test(unit.text) && !SCOPED_AUTONOMY_SIGNAL.test(unit.text)) {
        pushIssue(issues, "CONTRADICTORY_ACTION_PERMISSION", path, `第 ${unit.line} 行在同一规则中同时要求先问与自主推进，且没有条件分支`);
      }
    });
  });
  ["evals/skill-ir.json", "evals/capability-manifest.json", "integrations/tool-contracts.json"].forEach((path) => {
    if (!files[path]) return;
    try {
      jsonContractUnits(JSON.parse(files[path])).forEach((unit) => {
        if (ASK_FIRST_SIGNAL.test(unit.text) && AUTONOMOUS_SIGNAL.test(unit.text) && !SCOPED_AUTONOMY_SIGNAL.test(unit.text)) {
          pushIssue(issues, "CONTRADICTORY_ACTION_PERMISSION", path, `${unit.key} 同时要求先问与自主推进，且没有条件分支`);
        }
      });
    } catch { /* JSON parsing reports its own P0 issue. */ }
  });
}

function validateAdjacentDuplicateSentences(files: Record<string, string>, issues: BundleStaticIssue[]) {
  Object.entries(files).filter(([path]) => path === "SKILL.md" || /^references\/.*\.(?:md|txt)$/i.test(path)).forEach(([path, content]) => {
    const units = markdownContractUnits(content);
    for (let index = 1; index < units.length; index += 1) {
      const previous = normalizeSentence(units[index - 1].text);
      const current = normalizeSentence(units[index].text);
      if (current.length >= 8 && current === previous) {
        pushIssue(issues, "ADJACENT_DUPLICATE_SENTENCE", path, `第 ${units[index].line} 行与前一句重复`);
      }
    }
  });
}

function collectPromptFields(value: unknown, prefix: string): Array<{ key: string; value: string }> {
  if (Array.isArray(value)) return value.flatMap((item, index) => collectPromptFields(item, `${prefix}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const field = `${prefix}.${key}`;
    if (typeof child === "string" && /(?:^|_)(?:prompt|instruction)(?:$|_)/i.test(key)) return [{ key: field, value: child }];
    return child && typeof child === "object" ? collectPromptFields(child, field) : [];
  });
}

function validatePromptCompleteness(files: Record<string, string>, issues: BundleStaticIssue[]) {
  const prompts: Array<{ path: string; key: string; value: string }> = [];
  const yamlPrompt = files["agents/openai.yaml"]?.match(/^\s{2}default_prompt:\s*(.+)$/m)?.[1];
  if (yamlPrompt) {
    try { prompts.push({ path: "agents/openai.yaml", key: "default_prompt", value: String(JSON.parse(yamlPrompt)) }); } catch { /* YAML validator reports this. */ }
  }
  Object.entries(files).filter(([path]) => path.endsWith(".json")).forEach(([path, content]) => {
    try { prompts.push(...collectPromptFields(JSON.parse(content), "root").map((item) => ({ path, ...item }))); } catch { /* JSON validator reports this. */ }
  });
  prompts.forEach((prompt) => {
    if (/[；;]\s*$/.test(prompt.value)) pushIssue(issues, "INCOMPLETE_PROMPT", prompt.path, `${prompt.key} 以未完成的分号结尾`);
    if (PROMPT_TEMPLATE_SIGNAL.test(prompt.value)) pushIssue(issues, "TEMPLATE_PROMPT_TEXT", prompt.path, `${prompt.key} 仍含生成器样板词：${prompt.value.match(PROMPT_TEMPLATE_SIGNAL)?.[0] || "template"}`);
  });
}

function normalizedInputConcept(value: string) {
  return value.toLowerCase()
    .replace(/(?:用户提供的?|现有的?|完整的?|具体的?|相关的?|目标的?|原始的?)/g, "")
    .replace(/(?:文本|文件|内容|信息|资料|材料)$/g, "")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "")
    .trim();
}

function inputConceptOverlap(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const shortest = Math.min(left.length, right.length);
  if (shortest >= 3 && (left.includes(right) || right.includes(left))) return true;
  const leftTokens = new Set(left.match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2}/g) || []);
  const rightTokens = new Set(right.match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2}/g) || []);
  const minimum = Math.min(leftTokens.size, rightTokens.size);
  if (!minimum) return false;
  const shared = [...leftTokens].filter((item) => rightTokens.has(item)).length;
  return shared / minimum >= 0.8;
}

function validateSkillIRInputSpecificity(files: Record<string, string>, issues: BundleStaticIssue[]) {
  if (!files["evals/skill-ir.json"]) return;
  try {
    const parsed = JSON.parse(files["evals/skill-ir.json"]) as { inputs?: Array<Record<string, unknown>> };
    const inputs = Array.isArray(parsed.inputs) ? parsed.inputs : [];
    inputs.forEach((input, index) => {
      const label = String(input.name || input.concept || input.id || `input-${index + 1}`).trim();
      if (inputs.length > 1 && GENERIC_INPUT_SIGNAL.test(label.replace(/[\s_-]+/g, ""))) {
        pushIssue(issues, "BOILERPLATE_INPUT_OVERLAP", "evals/skill-ir.json", `输入“${label}”是无法区分来源或用途的通用样板，与已有具体输入重叠`);
      }
    });
    for (let leftIndex = 0; leftIndex < inputs.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < inputs.length; rightIndex += 1) {
        const leftLabel = String(inputs[leftIndex].name || inputs[leftIndex].concept || inputs[leftIndex].id || "");
        const rightLabel = String(inputs[rightIndex].name || inputs[rightIndex].concept || inputs[rightIndex].id || "");
        const leftConcept = normalizedInputConcept(String(inputs[leftIndex].concept || leftLabel));
        const rightConcept = normalizedInputConcept(String(inputs[rightIndex].concept || rightLabel));
        if (inputConceptOverlap(leftConcept, rightConcept)) {
          pushIssue(issues, "BOILERPLATE_INPUT_OVERLAP", "evals/skill-ir.json", `输入“${leftLabel}”与“${rightLabel}”表达同一语义，应合并为一个可判定输入`);
        }
      }
    }
  } catch { /* JSON parsing reports its own P0 issue. */ }
}

export function validateBundleContentCoherence(files: Record<string, string>) {
  const issues: BundleStaticIssue[] = [];
  validateContentPermissionCoherence(files, issues);
  validateAdjacentDuplicateSentences(files, issues);
  validatePromptCompleteness(files, issues);
  validateSkillIRInputSpecificity(files, issues);
  return [...new Map(issues.map((issue) => [`${issue.code}:${issue.path}:${issue.message}`, issue])).values()];
}

export function validateBundleStructure(files: Record<string, string>): BundleStaticValidation {
  const issues: BundleStaticIssue[] = [];
  const paths = Object.keys(files);
  paths.forEach((path) => {
    if (!safeBundlePath(path)) pushIssue(issues, "INVALID_BUNDLE_PATH", path, `文件路径不安全或为空：${path || "<empty>"}`);
    if (!files[path]?.trim()) pushIssue(issues, "EMPTY_REQUIRED_FILE", path, `文件为空：${path}`);
  });
  if (!files["SKILL.md"]?.trim()) pushIssue(issues, "MISSING_REQUIRED_FILE", "SKILL.md", "缺少 SKILL.md");
  else {
    validateSkillFrontmatter(files["SKILL.md"], issues);
    validateRequiredSections(files["SKILL.md"], issues);
  }

  REQUIRED_HARNESS.forEach((path) => {
    if (!files[path]?.trim()) pushIssue(issues, "MISSING_REQUIRED_FILE", path, `缺少运行所需文件：${path}`);
  });
  let manifestDeclaresSkillIR = false;
  try {
    const manifest = JSON.parse(files["evals/capability-manifest.json"] || "{}") as { version?: string; skill_ir?: unknown };
    manifestDeclaresSkillIR = Boolean(manifest.skill_ir) || Number.parseFloat(manifest.version || "0") >= 3;
  } catch { /* The JSON gate reports this separately. */ }
  if (manifestDeclaresSkillIR && !files["evals/skill-ir.json"]?.trim()) {
    pushIssue(issues, "MISSING_REQUIRED_FILE", "evals/skill-ir.json", "Capability Manifest 声明了 Canonical SkillIR，但文件不存在");
  }
  if (!files["agents/openai.yaml"]?.trim()) pushIssue(issues, "MISSING_REQUIRED_FILE", "agents/openai.yaml", "缺少 agents/openai.yaml");
  else validateInterfaceYaml(files["agents/openai.yaml"], issues);

  Object.entries(files).filter(([path]) => path.endsWith(".json")).forEach(([path, content]) => {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (path === "evals/capability-manifest.json") validateManifestDuplicates(parsed, issues);
      if (path === "evals/evals.json" && parsed && typeof parsed === "object") {
        const evals = (parsed as { evals?: unknown }).evals;
        if (!Array.isArray(evals)) pushIssue(issues, "INVALID_JSON_SCHEMA", path, "evals/evals.json 缺少 evals 数组");
        else {
          const duplicates = duplicateValues(evals.map((item) => item && typeof item === "object" ? String((item as Record<string, unknown>).id || "") : ""));
          if (duplicates.length) pushIssue(issues, "DUPLICATE_EVAL_ID", path, `评测 ID 重复：${duplicates.join("、")}`);
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown parse error";
      pushIssue(issues, "INVALID_JSON", path, `${path} 不是有效 JSON：${detail}`);
    }
  });

  if (files["evals/skill-ir.json"] && files["evals/capability-manifest.json"] && files["evals/evals.json"]) {
    auditSkillIRFiles(files).forEach((message) => pushIssue(issues, "SKILL_IR_CLOSURE", "evals/skill-ir.json", message));
  }

  const runtimeText = Object.entries(files)
    .filter(([path]) => path === "SKILL.md" || path.startsWith("references/"))
    .map(([, content]) => content)
    .join("\n");
  const references = [...new Set(runtimeText.match(RUNTIME_FILE_REFERENCE) || [])];
  references.filter((path) => !files[path]?.trim()).forEach((path) => {
    pushIssue(issues, "MISSING_REFERENCED_FILE", path, `运行时引用指向不存在的文件：${path}`);
  });

  const runner = files["evals/run_evals.py"] || "";
  if (runner && (!runner.includes("# skillcanvas-owned-eval-runner:v1") || !/def\s+main\s*\(/.test(runner) || !/if\s+__name__\s*==\s*["']__main__["']/.test(runner) || !/ArgumentParser\s*\(/.test(runner))) {
    pushIssue(issues, "EVAL_RUNNER_START_CONTRACT", "evals/run_evals.py", "Eval runner 不是编译器生成的可启动版本，或缺少 main、CLI parser、启动入口");
  }
  const checker = files["evals/artifact_checker.py"] || "";
  if (checker && !checker.includes("# skillcanvas-owned-artifact-checker:v1")) pushIssue(issues, "INVALID_HARNESS_FILE", "evals/artifact_checker.py", "artifact checker 不是编译器生成的受检版本");

  issues.push(...validateBundleContentCoherence(files));

  const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}:${issue.path}:${issue.message}`, issue])).values()];
  const passed = (code: string) => !uniqueIssues.some((issue) => issue.code === code || issue.code.startsWith(code));
  const checks: BundleStaticCheck[] = [
    { id: "frontmatter", label: "SKILL.md frontmatter", passed: passed("INVALID_SKILL_FRONTMATTER") && Boolean(files["SKILL.md"]) },
    { id: "yaml", label: "YAML 解析", passed: passed("INVALID_YAML") && Boolean(files["agents/openai.yaml"]) },
    { id: "json", label: "JSON 解析", passed: passed("INVALID_JSON") },
    { id: "paths", label: "文件路径与引用", passed: passed("INVALID_BUNDLE_PATH") && passed("MISSING_REFERENCED_FILE") && passed("MISSING_REQUIRED_FILE") },
    { id: "duplicates", label: "Manifest 与 Eval 去重", passed: passed("DUPLICATE") },
    { id: "skill-ir", label: "Canonical SkillIR 闭环", passed: !manifestDeclaresSkillIR || (passed("SKILL_IR_CLOSURE") && Boolean(files["evals/skill-ir.json"])) },
    { id: "runner", label: "Eval runner 启动契约", passed: passed("EVAL_RUNNER_START_CONTRACT") },
    { id: "content-coherence", label: "确定性内容自洽", passed: !uniqueIssues.some((issue) => ["CONTRADICTORY_ACTION_PERMISSION", "ADJACENT_DUPLICATE_SENTENCE", "INCOMPLETE_PROMPT", "TEMPLATE_PROMPT_TEXT", "BOILERPLATE_INPUT_OVERLAP"].includes(issue.code)) },
  ];
  const executionReady = !uniqueIssues.some((issue) => issue.priority === "P0");
  const contractReady = !uniqueIssues.some((issue) => issue.priority === "P1");
  return { valid: executionReady && contractReady, executionReady, contractReady, issues: uniqueIssues, checks };
}
