import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const runtimeDirectory = resolve(".wrangler");
const secretPath = resolve(runtimeDirectory, "skillcanvas-vault-key");
mkdirSync(runtimeDirectory, { recursive: true });
let vaultSecret = process.env.SKILLCANVAS_CREDENTIAL_SECRET?.trim() || "";
if (!vaultSecret) {
  try {
    vaultSecret = readFileSync(secretPath, "utf8").trim();
  } catch {
    vaultSecret = randomBytes(48).toString("base64url");
    writeFileSync(secretPath, `${vaultSecret}\n`, { encoding: "utf8", mode: 0o600 });
  }
}

const webEnvironment = { ...process.env, SKILLCANVAS_CREDENTIAL_SECRET: vaultSecret };

let sandbox = null;
try {
  const status = await fetch("http://127.0.0.1:4318/status", { signal: AbortSignal.timeout(500) });
  if (!status.ok) throw new Error("sandbox is not healthy");
  process.stdout.write("SkillCanvas is reusing the healthy local sandbox on port 4318\n");
} catch {
  sandbox = spawn(process.execPath, ["scripts/skill-sandbox-server.mjs"], { stdio: "inherit" });
}
const web = spawn("pnpm", ["run", "dev:web"], { stdio: "inherit", env: webEnvironment });

function stop(signal = "SIGTERM") {
  sandbox?.kill(signal);
  web.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
web.on("exit", (code) => {
  sandbox?.kill("SIGTERM");
  process.exitCode = code ?? 0;
});
sandbox?.on("exit", (code) => {
  if (code && web.exitCode === null) {
    web.kill("SIGTERM");
    process.exitCode = code;
  }
});
