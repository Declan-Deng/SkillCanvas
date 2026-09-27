export type GenerationLoopOutcome =
  | "not-run"
  | "running"
  | "accepted"
  | "accepted-with-issues"
  | "stable"
  | "evaluated-no-improvement"
  | "no-safe-change"
  | "evaluation-incomplete"
  | "build-blocked"
  | "failed";

export type GenerationResultCopy = {
  title: string;
  body: string;
  panelTitle: string;
  panelBody: string;
  badge: string;
  action: string;
  tone: "idle" | "running" | "completed" | "attention";
  issueLabel: string;
};

type GenerationResultInput = {
  outcome: GenerationLoopOutcome;
  issueCount?: number;
  lift?: number;
};

function issueSuffix(issueCount: number) {
  return issueCount > 0 ? `下方有 ${issueCount} 条测试记录可查看。` : "";
}

function issueLabel(issueCount: number) {
  return issueCount > 0 ? `查看 ${issueCount} 条测试记录` : "查看测试记录";
}

/**
 * Beginner-facing result copy. The structured outcome is authoritative: do
 * not infer whether a candidate ran from scores or from a technical log line.
 */
export function generationResultCopy({ outcome, issueCount = 0, lift = 0 }: GenerationResultInput): GenerationResultCopy {
  const records = issueLabel(issueCount);
  switch (outcome) {
    case "accepted":
      return {
        title: "Skill 已生成并通过测试",
        body: `当前版本已通过真实任务测试并保存${lift > 0 ? `，使用 Skill 后的对照得分提升了 ${lift} 分` : ""}。`,
        panelTitle: "测试通过，当前版本已保存",
        panelBody: "系统已经完成真实任务测试。当前版本表现更好，已作为最终版本保留。",
        badge: "✓ 已保存",
        action: "查看结果",
        tone: "completed",
        issueLabel: records,
      };
    case "accepted-with-issues":
      return {
        title: "Skill 已优化，还有测试记录需要查看",
        body: `系统已经保存表现更好的修改，但仍有内容需要你确认。${issueSuffix(issueCount)}`,
        panelTitle: "修改已保存，还有内容需要确认",
        panelBody: `新版本在测试中表现更好，系统已经保存。${issueSuffix(issueCount)}`,
        badge: "需要确认",
        action: "继续优化",
        tone: "attention",
        issueLabel: records,
      };
    case "stable":
      return {
        title: "Skill 已生成，当前版本已保留",
        body: "现有版本已通过测试。新的修改没有带来稳定提升，因此没有替换当前版本。",
        panelTitle: "测试完成，当前版本无需更换",
        panelBody: "现有版本已经达到本轮测试要求。新的修改没有稳定变好，所以系统保留了当前版本。",
        badge: "✓ 已保留",
        action: "再次测试",
        tone: "completed",
        issueLabel: records,
      };
    case "evaluated-no-improvement":
      return {
        title: "Skill 已生成，测试已完成",
        body: `系统测试了修改版，但表现没有更好，所以没有应用。当前版本仍然保留。${issueSuffix(issueCount)}`,
        panelTitle: "修改版没有更好，当前版本已保留",
        panelBody: `修改版已经完成真实任务测试，但没有稳定优于当前版本，因此没有替换它。${issueSuffix(issueCount)}`,
        badge: "✓ 未替换",
        action: "再试一次",
        tone: "completed",
        issueLabel: records,
      };
    case "no-safe-change":
      return {
        title: "Skill 已生成，自动修改未应用",
        body: `系统找到了需要改进的地方，但这次没有生成安全、有效的修改，所以没有更改当前版本。${issueSuffix(issueCount)}`,
        panelTitle: "发现了问题，但这次没有安全修改",
        panelBody: `当前 Skill 已保存。系统没有找到能安全应用的修改，因此没有进入修改版测试，也没有覆盖当前版本。${issueSuffix(issueCount)}`,
        badge: "需要查看",
        action: "重新尝试",
        tone: "attention",
        issueLabel: records,
      };
    case "evaluation-incomplete":
      return {
        title: "Skill 已生成，测试没有完成",
        body: `Skill 文件已保存，但测试中途停止，暂时无法判断修改是否更好。当前版本没有被覆盖。${issueSuffix(issueCount)}`,
        panelTitle: "测试中途停止",
        panelBody: `Skill 文件已经保存，但本轮测试没有完整跑完。请查看测试记录后重新运行。${issueSuffix(issueCount)}`,
        badge: "测试未完成",
        action: "重新测试",
        tone: "attention",
        issueLabel: records,
      };
    case "build-blocked":
      return {
        title: "Skill 已生成，但需要先修复结构",
        body: `基础检查发现文件结构或步骤衔接有问题，真实任务测试还没开始。当前内容已保留。${issueSuffix(issueCount)}`,
        panelTitle: "需要先修复生成文件",
        panelBody: `文件结构、引用路径或步骤衔接仍有问题，所以真实任务测试还没有开始。${issueSuffix(issueCount)}`,
        badge: "尚未测试",
        action: "继续修复",
        tone: "attention",
        issueLabel: records,
      };
    case "failed":
      return {
        title: "这次没有生成完成",
        body: "生成过程中遇到问题。你填写的内容已经保留，可以从当前步骤重试。",
        panelTitle: "生成没有完成",
        panelBody: `系统在生成文件时遇到问题。你填写的内容仍然保留，请查看记录后重试。${issueSuffix(issueCount)}`,
        badge: "需要重试",
        action: "重新生成",
        tone: "attention",
        issueLabel: records,
      };
    case "running":
      return {
        title: "正在测试当前 Skill",
        body: "系统正在用固定任务检查当前 Skill，并判断是否需要修改。",
        panelTitle: "正在运行真实任务测试",
        panelBody: "系统会先测试当前版本，再决定是否生成和应用修改。",
        badge: "测试中",
        action: "",
        tone: "running",
        issueLabel: records,
      };
    case "not-run":
    default:
      return {
        title: "尚未开始测试",
        body: "Skill 生成后，系统会用固定任务检查效果。",
        panelTitle: "真实任务测试尚未开始",
        panelBody: "完成生成文件检查后，系统会自动开始测试。",
        badge: "未开始",
        action: "开始测试",
        tone: "idle",
        issueLabel: records,
      };
  }
}
