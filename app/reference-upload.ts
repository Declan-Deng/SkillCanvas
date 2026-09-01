export const REFERENCE_FILE_ACCEPT = ".pdf,.md,.markdown,.txt,.json,.csv,.html,.js,.ts,.tsx,.py";
const TEXT_EXTENSIONS = /\.(md|markdown|txt|json|csv|html|js|ts|tsx|py)$/i;

export type ParsedReference = { label: string; text: string; warning: string };

/** Read material only; its positive/negative/background role belongs to the destination field. */
export async function readReferenceFiles(files: File[], fetcher: typeof fetch = fetch) {
  const warnings = files.length > 8 ? ["每次最多读取 8 个文件，其余文件请分批上传。"] : [];
  const results = await Promise.allSettled(files.slice(0, 8).map(async (file): Promise<ParsedReference> => {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf && !TEXT_EXTENSIONS.test(file.name)) throw new Error(`${file.name}：不支持此格式，请上传 PDF、Markdown 或文本文件`);
    if (!file.size) throw new Error(`${file.name}：文件为空`);
    if (file.size > (isPdf ? 8 * 1024 * 1024 : 2_000_000)) throw new Error(`${file.name} 超过 ${isPdf ? 8 : 2} MB`);
    if (!isPdf) {
      const text = (await file.text()).replace(/^\uFEFF/, "").trim();
      if (!text) throw new Error(`${file.name}：没有可读取的文字`);
      return { label: file.name, text: `\n--- ${file.name} ---\n${text}`, warning: "" };
    }
    const form = new FormData();
    form.append("file", file, file.name);
    const response = await fetcher("/api/parse-pdf", { method: "POST", body: form, signal: AbortSignal.timeout(25_000) });
    const data = await response.json() as { error?: string; text?: string; totalPages?: number; characterCount?: number; scannedLikely?: boolean };
    if (!response.ok) throw new Error(`${file.name}：${data.error || "解析失败"}`);
    if (data.scannedLikely) throw new Error(`${file.name} 像扫描件，没有可读取文字；需要先 OCR`);
    if (!data.text?.trim()) throw new Error(`${file.name}：没有可读取的文字`);
    return {
      label: `${file.name} · ${data.totalPages || 0} 页`,
      text: `\n--- ${file.name}（PDF，共 ${data.totalPages || 0} 页）---\n${data.text}`,
      warning: (data.characterCount || 0) < 200 ? `${file.name} 提取到的文字很少，请确认内容是否完整` : "",
    };
  }));
  const successful: ParsedReference[] = [];
  for (const result of results) {
    if (result.status === "rejected") warnings.push(result.reason instanceof Error ? result.reason.message : "资料读取失败");
    else {
      successful.push(result.value);
      if (result.value.warning) warnings.push(result.value.warning);
    }
  }
  return { successful, warnings };
}

/** Never silently truncate either the user's existing text or an uploaded document. */
export function appendReferenceFiles(current: string, files: ParsedReference[], maxLength: number) {
  let text = current;
  const accepted: ParsedReference[] = [];
  const warnings: string[] = [];
  for (const file of files) {
    const next = `${text}${text ? "\n" : ""}${file.text}`;
    if (next.length > maxLength) {
      warnings.push(`${file.label} 未添加：超出 ${maxLength.toLocaleString("en-US")} 字符上限，请精简材料后重试；原内容已保留。`);
    } else {
      text = next;
      accepted.push(file);
    }
  }
  return { text, accepted, warnings };
}
