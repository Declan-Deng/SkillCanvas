type Capability = {
  id: string; kind: string; affects?: string[];
};

// These are host interface facets, not task/domain rules. In particular the
// spreadsheet host can both analyse and export: embedding its analysis facet
// never fulfils a file-delivery contract or grants permission to write files.
const ADAPTERS: Record<string, { when: string; input: string; output: string; operation: string }> = {
  "host-document-reading": {
    when: "this step needs facts from an actually supplied PDF, Word or long document",
    input: "the relevant supplied document and the pages/sections needed by this step",
    output: "extracted facts with page/section evidence and any unreadable ranges",
    operation: "Read the relevant document content; do not infer content from its filename",
  },
  "host-image-understanding": {
    when: "this step needs visible evidence from an actually supplied image, screenshot or chart",
    input: "the relevant supplied image and this step's specific inspection question",
    output: "observations grounded in visible content, with uncertainty and unreadable regions",
    operation: "Inspect the image; distinguish visible observations from inference",
  },
  "host-spreadsheet-analysis": {
    when: "this step needs calculations or comparisons from available structured records or a supplied spreadsheet",
    input: "the relevant available records, field meanings and confirmed calculation rules",
    output: "checked calculations and comparisons, with formulas, source rows and anomalies",
    operation: "Analyse the actual records without modifying the source. This is analysis only: saving/exporting a file requires a separate declared persist step and must not be claimed here",
  },
};

export function hostEvidenceAdapter(capability: Capability) {
  if (capability.kind !== "builtin-tool" || capability.affects?.some((effect) => /artifact-output|file-output/.test(effect))) return undefined;
  return ADAPTERS[capability.id];
}
