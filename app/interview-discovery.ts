import { optionConflictsWithPriorEvidence } from "./discovery-preview.ts";

/**
 * Detect goals that name only a generic assistant/improvement, without a
 * concrete task, input, domain, or deliverable. The preview can use this to
 * label its concrete recommendation as a working hypothesis rather than fact.
 */
export function goalNeedsTaskDiscovery(value: string) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  const concreteAnchor = /(?:周报|日报|月报|报告|计划|排期|日程|合同|简历|邮件|文案|文章|表格|数据|发票|预算|账单|会议|录音|图片|视频|代码|项目|仓库|测试|旅行|行程|招聘|销售|客服|课程|论文|文档|文件|翻译|审查|审核|对比|分析|总结|提取|改写|生成.{0,8}(?:图|文|表|文件)|report|schedule|calendar|contract|resume|email|invoice|budget|meeting|code|repository|test|travel|document|file|translate|review|audit|compare|analy[sz]e|summari[sz]e)/i;
  if (concreteAnchor.test(text)) return false;
  const genericGoal = /(?:助手|助理|智能体|工具|工作流|效率|更好|好用|帮我工作|agent|assistant|workflow|productivity)/i.test(text);
  return genericGoal || text.replace(/[\s，。,.!?！？、]/g, "").length < 8;
}

/**
 * Pick a concrete, reversible working recommendation for beginner interviews.
 * "Ask AI to decide" remains an escape hatch for the user, but choosing it by
 * default makes the AI appear to have avoided the decision it was asked to
 * help with. Providers may still return that option (or omit a recommendation),
 * so recover to the first evidence-compatible concrete option.
 */
export function pickRecommendedInterviewOption(
  options: string[],
  requested: unknown,
  priorEvidence: string,
  unsureOption: string,
) {
  const requestedOption = typeof requested === "string" ? requested.trim() : "";
  if (
    requestedOption
    && requestedOption !== unsureOption
    && options.includes(requestedOption)
    && !optionConflictsWithPriorEvidence(requestedOption, priorEvidence)
  ) return requestedOption;

  return options.find((option) => option !== unsureOption && !optionConflictsWithPriorEvidence(option, priorEvidence))
    || options.find((option) => option !== unsureOption)
    || (options.includes(unsureOption) ? unsureOption : undefined);
}
