/** Compiler-owned source spans. The model selects IDs instead of retyping or
 * translating quotations. Selection is not verification of a rule's meaning. */
type Source = { url: string; excerpt: string; query: string; title: string; authorityTier?: string };
export type EvidencePassage = { id: string; text: string };

function hash(text: string) {
  let value = 2166136261;
  for (const char of text) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  return (value >>> 0).toString(16);
}

export function sourcePassages(source: Pick<Source, "url" | "excerpt">): EvidencePassage[] {
  const text = source.excerpt.replace(/\s+/g, " ").trim();
  const passages: EvidencePassage[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 850, text.length);
    if (end < text.length) {
      const chunk = text.slice(start, end);
      const boundaries = [...chunk.matchAll(/[。！？；]|[.!?;](?=\s)/g)];
      const boundary = boundaries.at(-1)?.index ?? -1;
      if (boundary >= 300) end = start + boundary + 1;
    }
    const passage = text.slice(start, end).trim();
    if (passage.length >= 12) passages.push({ id: `passage-${hash(source.url)}-${start}-${hash(passage)}`, text: passage });
    start = end;
  }
  return passages;
}

const stopWords = new Set(["the", "and", "for", "with", "from", "when", "how", "are", "what", "this", "that", "official", "documentation", "primary", "method", "rules"]);
function terms(text: string) {
  const result = new Set((text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || []).filter((word) => !stopWords.has(word)));
  for (const match of text.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    for (let i = 0; i < match[0].length - 1; i++) result.add(match[0].slice(i, i + 2));
  }
  return [...result];
}

export function rankedSourcePassages(source: Source, focus: string[] = []) {
  const queryTerms = terms([source.query, ...focus].join(" "));
  const score = (text: string) => queryTerms.reduce((sum, term) => sum + Number(text.toLowerCase().includes(term)), 0);
  const passages = sourcePassages(source).map((passage, index) => ({ ...passage, index, score: score(passage.text) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const authority = { official: 5, primary: 4, reputable_secondary: 2, community: 1, unknown: 0 }[source.authorityTier || "unknown"] || 0;
  return { passages, score: (passages[0]?.score || 0) * 3 + score(source.title) * 2 + authority };
}

export function selectKnowledgeQueries(queries: string[], preferredDomains: string[]) {
  const domains = preferredDomains.filter((domain) => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain));
  // Retain open discovery alongside primary-site queries, so an unavailable
  // preferred publisher does not make the entire domain appear empty.
  return queries.slice(0, 4).map((query, index) => {
    const suffix = domains.length && index % 2 === 0 && !/\bsite:/i.test(query) ? ` site:${domains[Math.floor(index / 2) % domains.length]}` : "";
    return query.trim().slice(0, 180 - suffix.length) + suffix;
  });
}
