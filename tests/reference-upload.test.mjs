import assert from "node:assert/strict";
import test from "node:test";
import { appendReferenceFiles, readReferenceFiles, REFERENCE_FILE_ACCEPT } from "../app/reference-upload.ts";

test("Markdown and text files are parsed locally with their filename and structure", async () => {
  const result = await readReferenceFiles([new File(["\uFEFF# Reference\n\n- Keep this rule"], "example.MD"), new File(["Avoid this behavior"], "negative.txt")], () => { throw new Error("Text must not use an API"); });
  assert.equal(result.successful.length, 2);
  assert.deepEqual(result.warnings, []);
  assert.match(result.successful[0].text, /--- example.MD ---\n# Reference\n\n- Keep this rule/);
  assert.match(result.successful[1].text, /Avoid this behavior/);
  assert.match(REFERENCE_FILE_ACCEPT, /\.pdf,\.md,\.markdown/);
});

test("PDF uploads use the existing parser and retain page evidence", async () => {
  const result = await readReferenceFiles([new File(["%PDF-1.4"], "reference.pdf", { type: "application/pdf" })], async (url, init) => {
    assert.equal(url, "/api/parse-pdf");
    assert.equal(init.method, "POST");
    assert.equal(init.body.get("file").name, "reference.pdf");
    return Response.json({ text: "## 第 1 页\nDecision rule", totalPages: 1, characterCount: 250 });
  });
  assert.equal(result.successful[0].label, "reference.pdf · 1 页");
  assert.match(result.successful[0].text, /## 第 1 页\nDecision rule/);
});

test("partial upload failure preserves valid files and reports scans and unsupported files", async () => {
  const result = await readReferenceFiles([
    new File(["existing rule"], "good.md"), new File(["%PDF-1.4"], "scan.pdf"), new File(["binary"], "archive.zip"), new File([], "empty.txt"),
  ], async () => Response.json({ scannedLikely: true, text: "", totalPages: 2 }));
  assert.equal(result.successful.length, 1);
  assert.equal(result.warnings.length, 3);
  assert.match(result.warnings.join("\n"), /OCR/);
  assert.match(result.warnings.join("\n"), /不支持此格式/);
  assert.match(result.warnings.join("\n"), /文件为空/);
});

test("failed or empty PDF responses never count as uploaded material", async () => {
  for (const response of [Response.json({ error: "PDF 受密码保护" }, { status: 422 }), Response.json({ text: "" })]) {
    const result = await readReferenceFiles([new File(["%PDF"], "locked.pdf")], async () => response);
    assert.equal(result.successful.length, 0);
    assert.equal(result.warnings.length, 1);
  }
});

test("file size and batch limits are explicit, not silent", async () => {
  const large = await readReferenceFiles([new File([new Uint8Array(2_000_001)], "large.md"), new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.pdf")], () => { throw new Error("Oversized PDF must not be uploaded"); });
  assert.equal(large.successful.length, 0);
  assert.match(large.warnings.join("\n"), /2 MB/);
  assert.match(large.warnings.join("\n"), /8 MB/);
  const batch = await readReferenceFiles(Array.from({ length: 9 }, (_, n) => new File(["content"], `${n}.md`)));
  assert.equal(batch.successful.length, 8);
  assert.match(batch.warnings[0], /分批上传/);
});

test("appending keeps existing input and complete documents without truncation", () => {
  const files = [{ label: "too-long.md", text: "x".repeat(100), warning: "" }, { label: "fits.md", text: "new rule", warning: "" }];
  const result = appendReferenceFiles("User's negative example", files, 40);
  assert.equal(result.text, "User's negative example\nnew rule");
  assert.equal(result.accepted.length, 1);
  assert.match(result.warnings[0], /未添加.*原内容已保留/);
});
