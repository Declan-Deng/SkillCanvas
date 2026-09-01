/** Model confidence is advisory. Only the completed, generated four-round
 * interview may authorize blueprint generation, including retries. */
export function interviewCompletionGate(input: {
  rounds: Array<{ questions: Array<{ id: string }> }>;
  origins: string[];
  answers: Record<string, string>;
  currentRoundIndex: number;
  highestRoundReached: number;
  expectedQuestionCounts: number[];
}) {
  const last = input.expectedQuestionCounts.length - 1;
  const seen = new Set<string>();
  for (let index = 0; index <= last; index++) {
    const questions = input.rounds[index]?.questions || [];
    const incomplete = input.origins[index] !== "ai" || questions.length !== input.expectedQuestionCounts[index]
      || new Set(questions.map((question) => question.id)).size !== questions.length
      || questions.some((question) => !question.id || seen.has(question.id) || !input.answers[question.id]?.trim());
    if (incomplete) return { ready: false, incompleteRound: index, message: `请先完成第 ${index + 1} 轮的全部问题；4 轮完成后才能生成蓝图` };
    questions.forEach((question) => seen.add(question.id));
  }
  if (last < 0 || input.currentRoundIndex !== last || input.highestRoundReached < last) {
    return { ready: false, incompleteRound: Math.max(0, last), message: "请完成全部 4 轮，并在最后一轮生成蓝图" };
  }
  return { ready: true, incompleteRound: null, message: "全部 4 轮已完成" };
}
