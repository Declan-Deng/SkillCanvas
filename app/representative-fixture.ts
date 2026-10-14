/** A first-turn preview illustrates the model's initial working hypothesis,
 * not a user's choice. Reuse it only while that hypothesis remains confirmed.
 * Otherwise synthesize a new private fixture from the final contract. */
export function previewFixtureMatchesAnswers(
  questions: Array<{ id: string; recommendedOption?: string }>,
  answers: Record<string, string>,
) {
  return questions.length > 0 && questions.every((question) =>
    Boolean(question.recommendedOption?.trim())
    && answers[question.id]?.trim() === question.recommendedOption?.trim(),
  );
}
