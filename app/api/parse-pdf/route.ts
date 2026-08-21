import { extractText, getDocumentProxy } from "unpdf";

const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_PDF_PAGES = 120;
const PARSE_TIMEOUT_MS = 18_000;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function normalizePageText(value: string) {
  return value
    .split("\u0000").join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const form = await request.formData();
    const upload = form.get("file");
    if (!(upload instanceof File)) return errorResponse("没有收到 PDF 文件", 400);
    if (upload.size === 0) return errorResponse("PDF 文件为空", 400);
    if (upload.size > MAX_PDF_BYTES) return errorResponse("PDF 不能超过 8 MB", 413);

    const bytes = new Uint8Array(await upload.arrayBuffer());
    const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
    if (signature !== "%PDF-") return errorResponse("文件内容不是有效 PDF", 415);

    pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > MAX_PDF_PAGES) return errorResponse(`PDF 共 ${pdf.numPages} 页，当前最多解析 ${MAX_PDF_PAGES} 页`, 422);

    const extraction = extractText(pdf, { mergePages: false });
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("PDF 解析超时，请尝试拆分文件")), PARSE_TIMEOUT_MS);
    });
    const { text, totalPages } = await Promise.race([extraction, timeout]);
    if (timeoutId) clearTimeout(timeoutId);
    const pages = text.map(normalizePageText);
    const characterCount = pages.reduce((total, page) => total + page.length, 0);
    const scannedLikely = characterCount < Math.max(40, totalPages * 12);

    return Response.json({
      totalPages,
      characterCount,
      scannedLikely,
      text: pages.map((page, index) => `## 第 ${index + 1} 页\n${page || "[本页未提取到文字]"}`).join("\n\n"),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "PDF 解析失败";
    const message = /password/i.test(raw)
      ? "PDF 受密码保护，请先解锁后再上传"
      : raw.includes("超时") ? raw : "PDF 无法解析，文件可能损坏或格式不受支持";
    return errorResponse(message, 422);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (pdf && typeof pdf.destroy === "function") await pdf.destroy().catch(() => undefined);
  }
}
