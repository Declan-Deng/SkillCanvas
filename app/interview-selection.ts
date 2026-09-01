type SelectionMode = "single" | "multiple";
type SelectableQuestion = { selectionMode: SelectionMode; options: string[] };

/** Changing the control mode never rewrites the user's existing answer. */
export function enableMultipleSelection<Q extends { selectionMode: SelectionMode }>(question: Q): Q {
  return { ...question, selectionMode: "multiple" };
}

/** Shares the existing semicolon-delimited answer contract with native multi-select questions. */
export function toggleInterviewAnswer(question: SelectableQuestion, current: string, option: string, unsureOption: string) {
  if (!question.options.includes(option)) return current;
  if (question.selectionMode === "single") return option;
  if (option === unsureOption) return unsureOption;
  const selected = question.options.filter((item) => current.split("；").includes(item) && item !== unsureOption);
  const updated = selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option];
  return updated.join("；");
}
