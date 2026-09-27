const CONVERSATIONAL_MODES = new Set([
  "preview",
  "interview",
  "demo",
  "demo-chat",
  "demo-inspiration",
]);

const CONTENT_GENERATION_MODES = new Set([
  "knowledge-compile",
  "build",
  "eval-execute",
  "personalize",
  "optimization-evidence",
  "optimize",
]);

export function generationTemperature(mode: string, attempt: number) {
  // DeepSeek recommends temperature 0 for coding/math. Most pipeline calls are
  // stricter than ordinary chat because their JSON feeds a compiler and gates.
  // Keep a little variation only where wording or realistic dialogue benefits.
  if (CONVERSATIONAL_MODES.has(mode)) return attempt > 1 ? 0.15 : 0.35;
  if (CONTENT_GENERATION_MODES.has(mode)) return attempt > 1 ? 0.05 : 0.15;
  return 0;
}
