import { readFile } from "node:fs/promises";
import { HOST_FILE_WORKSPACE_CAPABILITY } from "../../app/host-file-capability.ts";
import { HOST_WEB_SEARCH_CAPABILITY } from "../../app/capability-routing.ts";

// Same literal catalog as the UI, so new entries automatically enter the
// routing matrix instead of being missed by a hand-maintained test list.
const page = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
const declaration = page.indexOf("const CAPABILITY_LIBRARY:");
const start = page.indexOf("= [", declaration) + 2;
const end = page.indexOf("\n];", start) + 2;
if (declaration < 0 || start < 2 || end < 2) throw new Error("Capability catalog not found");
export const capabilityCatalog = new Function("HOST_FILE_WORKSPACE_CAPABILITY", "HOST_WEB_SEARCH_CAPABILITY", `return (${page.slice(start, end)})`)(HOST_FILE_WORKSPACE_CAPABILITY, HOST_WEB_SEARCH_CAPABILITY);
