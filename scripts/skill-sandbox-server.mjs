import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, sep } from "node:path";

const port = Number(process.env.SKILLCANVAS_SANDBOX_PORT || 4318);
const MAX_BODY = 3_000_000;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/ -]{1,260}$/;

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://localhost:3000",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function safePath(root, relative) {
  if (!SAFE_PATH.test(relative)) throw new Error(`unsafe path: ${relative}`);
  const absolute = normalize(join(root, relative));
  if (!absolute.startsWith(`${root}${sep}`)) throw new Error(`path escaped workspace: ${relative}`);
  return absolute;
}

function globMatches(path, pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "::ALL::").replace(/\*/g, "[^/]*").replace(/::ALL::/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(path);
}

async function runPythonTests(root, testPaths) {
  if (process.platform !== "darwin") return { status: "not_available", passed: false, detail: "OS sandbox adapter is currently implemented for macOS Seatbelt only" };
  if (!testPaths.length) return { status: "not_required", passed: true, detail: "No generated script test suite" };
  // macOS canonicalizes /var to /private/var before applying Seatbelt rules.
  // Granting the unresolved alias makes a writable directory look present to
  // Node but unusable to Python's tempfile module.
  const sandboxRoot = await realpath(root);
  const sandboxTmp = join(sandboxRoot, ".sandbox-tmp");
  await mkdir(sandboxTmp, { recursive: true });
  const quotedRoot = JSON.stringify(sandboxRoot);
  const profile = `(version 1)\n(deny default)\n(allow process-exec)\n(allow process-fork)\n(allow file-read*)\n(allow file-write* (subpath ${quotedRoot}))\n(deny network*)`;
  const absoluteTests = testPaths.map((path) => safePath(sandboxRoot, path));
  const runner = [
    "import importlib.util, sys, unittest",
    `paths = ${JSON.stringify(absoluteTests)}`,
    "suite = unittest.TestSuite()",
    "loader = unittest.defaultTestLoader",
    "for index, path in enumerate(paths):",
    "    spec = importlib.util.spec_from_file_location(f'skillcanvas_test_{index}', path)",
    "    if spec is None or spec.loader is None:",
    "        raise RuntimeError(f'Unable to load test file: {path}')",
    "    module = importlib.util.module_from_spec(spec)",
    "    spec.loader.exec_module(module)",
    "    suite.addTests(loader.loadTestsFromModule(module))",
    "result = unittest.TextTestRunner(verbosity=2).run(suite)",
    "if result.testsRun == 0:",
    "    print('ERROR: generated test suite discovered zero tests', file=sys.stderr)",
    "    raise SystemExit(2)",
    "raise SystemExit(0 if result.wasSuccessful() else 1)",
  ].join("\n");
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/sandbox-exec", ["-p", profile, "python3", "-I", "-c", runner], {
      cwd: sandboxRoot,
      env: { ...process.env, TMPDIR: sandboxTmp, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 8_000);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ status: signal ? "timeout" : "executed", passed: code === 0, exitCode: code, detail: output.slice(-4_000) });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ status: "error", passed: false, detail: error.message });
    });
  });
}

async function verify(payload) {
  const files = payload.skillFiles && typeof payload.skillFiles === "object" ? payload.skillFiles : {};
  const executions = Array.isArray(payload.executions) ? payload.executions : [];
  const cases = Array.isArray(payload.cases) ? payload.cases : [];
  if (Object.keys(files).length > 80 || executions.length > 30) throw new Error("sandbox input exceeds bounded limits");
  const root = await mkdtemp(join(tmpdir(), "skillcanvas-sandbox-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      if (typeof content !== "string" || content.length > 500_000) throw new Error(`invalid file: ${path}`);
      const target = safePath(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    const caseById = new Map(cases.map((item) => [item.id, item]));
    const artifactChecks = [];
    for (const execution of executions) {
      const contractCase = caseById.get(execution.caseId) || {};
      const expected = Array.isArray(contractCase.expected?.artifacts) ? contractCase.expected.artifacts : [];
      const artifacts = Array.isArray(execution.artifacts) ? execution.artifacts : [];
      const written = [];
      for (const artifact of artifacts) {
        if (!artifact || typeof artifact.path !== "string" || typeof artifact.content !== "string") continue;
        const target = safePath(root, artifact.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, artifact.content, "utf8");
        written.push({ path: artifact.path, bytes: Buffer.byteLength(artifact.content) });
      }
      const missing = expected.filter((pattern) => !written.some((artifact) => artifact.bytes > 0 && globMatches(artifact.path, pattern)));
      artifactChecks.push({ caseId: execution.caseId, expected, written, missing, passed: missing.length === 0 });
    }
    const scriptTestPaths = Object.keys(files).filter((path) => path.startsWith("evals/script-tests/") && path.endsWith(".py"));
    const scriptTests = await runPythonTests(root, scriptTestPaths);
    return {
      runtime: "local-process-filesystem",
      network: "denied",
      toolAdapter: "not-configured",
      artifactChecks,
      scriptTests,
      passed: artifactChecks.every((item) => item.passed) && scriptTests.passed,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

createServer((request, response) => {
  if (request.method === "OPTIONS") return json(response, 204, {});
  if (request.method === "GET" && request.url === "/status") return json(response, 200, { ok: true, runtime: "local-process-filesystem", toolAdapter: "not-configured" });
  if (request.method !== "POST" || request.url !== "/verify") return json(response, 404, { error: "Not found" });
  let body = "";
  request.on("data", (chunk) => {
    body += String(chunk);
    if (body.length > MAX_BODY) request.destroy();
  });
  request.on("end", async () => {
    try {
      json(response, 200, await verify(JSON.parse(body)));
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : "sandbox verification failed" });
    }
  });
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`SkillCanvas local sandbox ready at http://127.0.0.1:${port}\n`);
});
