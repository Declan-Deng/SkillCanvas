// Editorial demos, not live model responses or measured evaluation results.
export type ReportAudience = "self" | "team";
export type ReportFocus = "changes" | "risks";

export function makeReportPreview(audience: ReportAudience, focus: ReportFocus) {
  const team = audience === "team";
  const riskFirst = focus === "risks";
  const structure = riskFirst ? ["风险与待确认", "本周变化", "下一步"] : ["本周变化", "风险与待确认", "下一步"];
  const descriptions: Record<string, string> = {
    "本周变化": team ? "汇总团队关注的基金与指数变化，说明对应材料与日期。" : "先列出指定基金与指数的变化，并说明对应材料与日期。",
    "风险与待确认": team ? "先列数据缺口与需协助核对的事项，不直接替团队做投资判断。" : "标出需要核实的信息，不直接替你做投资判断。",
    "下一步": team ? "列明需要团队协助核对的材料；未指定负责人时标注待确认。" : "整理后续需要持续关注的变化与待补充信息。",
  };
  return {
    title: team ? "团队基金周报" : "我的基金观察周报",
    recipient: team ? "给团队看" : "给自己看",
    structure,
    sections: structure.map(title => ({ title, detail: descriptions[title] })),
    rules: [team ? "优先说明团队需要关注和协助的事项。" : "只关注我指定的基金与指数。", riskFirst ? "先列风险与待确认事项，再说明变化。" : "先列变化，再解释证据。", "缺失数据时明确标注，不自行补齐。"],
  };
}

export const comparisonExamples = [
  {
    label: "不编造事实",
    input: "本周完成登录改版，转化率还没统计。",
    title: "不补出没有提供的结论",
    plain: "登录改版已显著提升转化率，项目取得良好成效。",
    skill: "登录改版已完成；转化率尚未统计，效果待核实。",
    rule: "数字、效果和因果结论必须有输入材料支持。没有依据的部分标注待核实。",
    explanation: "保留已完成的工作，把未验证的效果标出来。",
  },
  {
    label: "写清风险",
    input: "接口联调受阻。",
    title: "把风险写成可跟进的事项",
    plain: "接口联调仍需推进，后续将持续跟进。",
    skill: "风险：接口联调受阻。影响：尚未提供。处理动作：需要你补充。",
    rule: "风险按现状、影响、处理动作组织；缺少字段时指出缺口，不自行推测。",
    explanation: "写清遇到的问题，缺少的影响和处理动作请你补充。",
  },
  {
    label: "等你确认",
    input: "本周登录改版完成，接口联调受阻，下周计划灰度上线。",
    title: "在你要求的位置停下来",
    plain: "以下是整理好的周报正文，可直接发送。",
    skill: "已整理为进展、风险、计划。请先确认归类，我再写正文。",
    rule: "先归类材料，等用户明确确认后才生成正文。不得代替用户确认。",
    explanation: "先交付分类结果，等你确认后才继续写正文。",
  },
] as const;

export const skillFileExamples = [
  { path: "SKILL.md", label: "工作流程", intro: "规定任务如何开始、推进和交付。", rules: ["读取用户指定的基金与指数数据", "先整理变化和证据，等你确认后再撰写正文", "按用户确认的栏目顺序输出，并检查事实、来源与缺失数据"] },
  { path: "references/quality.md", label: "质量标准", intro: "把你判断结果是否合格的标准写清楚。", rules: ["只跟踪指定基金与指数，每项变化对应来源和材料日期", "区分事实、推断与待核实信息，不把未经核实的原因写成结论", "内容详略遵循你的偏好，缺失数据明确标注"] },
  { path: "references/source-policy.md", label: "资料来源", intro: "说明优先读取哪些资料，以及怎样使用外部信息。", rules: ["优先读取你提供的材料与历史案例，使用你认可的信息来源", "标注材料日期，区分旧数据与本周数据", "未取得的材料记为缺失，外部资料不能改写已确认的工作方式"] },
  { path: "references/boundaries.md", label: "权限边界", intro: "明确哪些事情可以做，哪些情况必须先询问你。", rules: ["不自行补齐数据，不虚构收益或原因，不替你作投资决定", "归类结果由你确认，AI 不能代替你确认", "缺少必要材料时列出缺口，请你补充", "工具不可用时说明限制，不假装执行成功"] },
] as const;

export const buildNodes = [
  { title: "你的需求", detail: "一句目标，加上你补充的背景与资料，是后续讨论的起点。", input: "模糊目标与个人资料", output: "需要进一步确认的问题", check: "还没说清的要求留待确认，不当作已经决定。" },
  { title: "工作方式", detail: "通过选项确认顺序、标准和边界，形成同一份需求依据。", input: "你的选择与校正", output: "已确认的需求说明", check: "后续生成不能悄悄替换用户确认的要求。" },
  { title: "Skill 文件", detail: "把要求组织成工作说明、参考资料和任务需要的文件。", input: "已确认的要求与可用能力", output: "Skill 文件包", check: "需要工具授权的能力，不能仅靠文字声称已经可用。" },
  { title: "结构检查", detail: "检查文件、步骤和依赖关系，把不完整的部分定位出来。", input: "生成的文件与工作流程", output: "检查结果或具体修复项", check: "检查没通过就修复对应部分，不能用模板假装任务已完成。" },
  { title: "任务对比", detail: "在网页测试环境中，对照普通 AI 与加载 Skill 的任务表现。", input: "同一任务与两个版本的回答", output: "表现差异与待改进项", check: "比较具体任务表现；网页测试不代表实际宿主里的工具已经验证。" },
  { title: "保留版本", detail: "尝试优化后重跑任务，没有改善时保留原版本。", input: "候选版本与回归结果", output: "保留的版本与检查记录", check: "候选表现下降时回到原版本，再定位要修复的环节。" },
] as const;
