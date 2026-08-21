import { createStoredZip } from "../../zip-utils";

type DownloadPayload = { files?: Record<string, unknown>; rootName?: unknown };

function safePath(path: string) {
  return path.length <= 180 && !path.includes("..") && /^[A-Za-z0-9._/-]+$/.test(path);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const raw = form.get("payload");
    if (typeof raw !== "string" || raw.length > 1_500_000) return new Response("Invalid download payload", { status: 400 });
    const parsed = JSON.parse(raw) as DownloadPayload;
    const rootName = typeof parsed.rootName === "string"
      ? parsed.rootName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63)
      : "skill";
    const files = Object.fromEntries(Object.entries(parsed.files || {}).filter((entry): entry is [string, string] => (
      safePath(entry[0]) && typeof entry[1] === "string" && entry[1].length <= 500_000
    )));
    if (!rootName || !files["SKILL.md"] || !Object.keys(files).length || Object.keys(files).length > 80) {
      return new Response("Invalid Skill bundle", { status: 400 });
    }
    const zip = createStoredZip(files, rootName);
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${rootName}.zip"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Unable to create Skill bundle", { status: 400 });
  }
}
