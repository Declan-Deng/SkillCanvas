function extractJsonCandidate(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  return start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
}

function extractJsonPrefixCandidates(raw: string) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  if (start < 0) return [cleaned];
  const candidates: string[] = [];
  for (let index = start; index < cleaned.length; index += 1) {
    if (cleaned[index] === "}" || cleaned[index] === "]") candidates.push(cleaned.slice(start, index + 1));
  }
  candidates.push(extractJsonCandidate(cleaned));
  return [...new Set(candidates)];
}

function repairJsonLexically(value: string) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (!inString) {
      if (character === '"') inString = true;
      output += character;
      continue;
    }
    if (escaped) {
      if (/^["\\/bfnrt]$/.test(character)) output += `\\${character}`;
      else if (character === "u" && /^[0-9a-fA-F]{4}$/.test(value.slice(index + 1, index + 5))) output += `\\u`;
      else output += `\\\\${character}`;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      const next = value.slice(index + 1).match(/^\s*([,:}\]])/)?.[1] || "";
      if (next) {
        inString = false;
        output += character;
      } else {
        output += '\\"';
      }
      continue;
    }
    if (character === "\n") { output += "\\n"; continue; }
    if (character === "\r") { output += "\\r"; continue; }
    if (character === "\t") { output += "\\t"; continue; }
    const code = character.charCodeAt(0);
    output += code <= 31 ? " " : character;
  }
  if (escaped) output += "\\\\";
  return output.replace(/,\s*([}\]])/g, "$1");
}

/** Repair container punctuation only. All keys, strings and values must be
 * complete; never invent a missing value, closing quote, or unfinished item. */
function repairJsonContainers(value: string, allowEndClosure: boolean) {
  type Frame = { kind: "object" | "array"; state: "key" | "colon" | "value" | "after"; empty: boolean };
  const stack: Frame[] = [];
  let out = "";
  let rootDone = false;
  const beginValue = () => {
    const parent = stack.at(-1);
    if (!parent) { if (rootDone) return false; rootDone = true; return true; }
    if (parent.state === "after" && parent.kind === "array") out += ",";
    else if (parent.state !== "value") return false;
    parent.state = "after"; parent.empty = false; return true;
  };
  const closable = (frame: Frame) => frame.state === "after" || (frame.empty && (frame.state === "key" || frame.state === "value"));
  for (let i = 0; i < value.length;) {
    const char = value[i];
    if (/\s/.test(char)) { out += char; i += 1; continue; }
    const parent = stack.at(-1);
    if (char === '"') {
      let end = i + 1;
      for (; end < value.length; end += 1) {
        if (value[end] === "\\") { end += 1; continue; }
        if (value[end] === '"') break;
      }
      if (end >= value.length) return "";
      const token = value.slice(i, end + 1);
      try { JSON.parse(token); } catch { return ""; }
      if (parent?.kind === "object" && (parent.state === "key" || parent.state === "after")) {
        if (parent.state === "after") out += ",";
        parent.state = "colon"; parent.empty = false;
      } else if (!beginValue()) return "";
      out += token; i = end + 1; continue;
    }
    if (char === "{" || char === "[") {
      if (!beginValue()) return "";
      stack.push({ kind: char === "{" ? "object" : "array", state: char === "{" ? "key" : "value", empty: true });
      out += char; i += 1; continue;
    }
    if (char === "}" || char === "]") {
      const kind = char === "}" ? "object" : "array";
      // A mismatched outer closer may omit inner closing punctuation, but
      // may not discard a key/value or substitute a different container.
      if (!stack.some((frame) => frame.kind === kind)) return "";
      while (stack.at(-1)?.kind !== kind) {
        const frame = stack.pop()!;
        if (!closable(frame)) return "";
        out += frame.kind === "object" ? "}" : "]";
      }
      if (!closable(stack.pop()!)) return "";
      out += char; i += 1; continue;
    }
    if (char === ":") {
      if (parent?.kind !== "object" || parent.state !== "colon") return "";
      parent.state = "value"; out += char; i += 1; continue;
    }
    if (char === ",") {
      if (!parent || parent.state !== "after") return "";
      parent.state = parent.kind === "object" ? "key" : "value";
      out += char; i += 1; continue;
    }
    const primitive = value.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=[\s,}\]]|$)/)?.[0];
    if (!primitive || !beginValue()) return "";
    out += primitive; i += primitive.length;
  }
  if (!rootDone || (stack.length && !allowEndClosure)) return "";
  while (stack.length) {
    const frame = stack.pop()!;
    if (!closable(frame)) return "";
    out += frame.kind === "object" ? "}" : "]";
  }
  try { return JSON.stringify(JSON.parse(out)); } catch { return ""; }
}

export function normalizeModelJsonContent(raw: string, options: { repairContainers?: boolean } = {}) {
  for (const candidate of extractJsonPrefixCandidates(raw)) {
    const invalidEscapeRepair = candidate.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");
    const lexicalRepair = repairJsonLexically(candidate);
    const combinedRepair = repairJsonLexically(invalidEscapeRepair);
    for (const version of [candidate, invalidEscapeRepair, lexicalRepair, combinedRepair]) {
      try {
        return JSON.stringify(JSON.parse(version));
      } catch {
        // Try the next bounded repair. The caller still validates the expected
        // response shape, so suffix cleanup cannot accept a partial result.
      }
    }
  }
  if (options.repairContainers) {
    // Work on the entire response, never on an arbitrary prefix of a broken
    // outer object. Callers must still validate the complete response schema.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    for (const candidate of [cleaned, repairJsonLexically(cleaned)]) {
      const repaired = repairJsonContainers(candidate, true);
      if (repaired) return repaired;
    }
  }
  return "";
}

export function diagnoseModelJsonFailure(raw: string) {
  const candidate = extractJsonCandidate(raw);
  let message = "unknown parse failure";
  try { JSON.parse(candidate); }
  catch (error) { message = error instanceof Error ? error.message : message; }
  const position = Number(message.match(/position\s+(\d+)/i)?.[1] || -1);
  const codes = position >= 0
    ? Array.from(candidate.slice(Math.max(0, position - 4), position + 5)).map((character) => character.charCodeAt(0)).join(".")
    : "none";
  let braces = 0;
  let brackets = 0;
  let quotes = 0;
  let escaped = false;
  for (const character of candidate) {
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (character === '"') quotes += 1;
    if (character === "{") braces += 1;
    if (character === "}") braces -= 1;
    if (character === "[") brackets += 1;
    if (character === "]") brackets -= 1;
  }
  return `parse=${message.slice(0, 120).replace(/[^a-zA-Z0-9 _.,:'"-]/g, "?")}; pos=${position}; codes=${codes}; braces=${braces}; brackets=${brackets}; quotes=${quotes}; newlines=${(candidate.match(/\n/g) || []).length}; backslashes=${(candidate.match(/\\/g) || []).length}`;
}
