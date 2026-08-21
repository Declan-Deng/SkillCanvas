import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { verifyBundleScriptTests, verifyExecutionsInLocalSandbox } from "../app/eval-workflow-service.ts";

test("local sandbox materializes artifacts and runs generated Python tests with network denied", async (context) => {
  const port = 44000 + (process.pid % 1000);
  const server = spawn(process.execPath, ["scripts/skill-sandbox-server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, SKILLCANVAS_SANDBOX_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => server.kill("SIGTERM"));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("sandbox did not start")), 4_000);
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("local sandbox ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.on("error", reject);
  });
  const response = await fetch(`http://127.0.0.1:${port}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skillFiles: { "evals/script-tests/test_smoke.py": "import unittest\n\nclass Smoke(unittest.TestCase):\n    def test_ok(self):\n        self.assertTrue(True)\n" },
      cases: [{ id: "artifact-case", expected: { artifacts: ["outputs/*.md"] } }],
      executions: [{ caseId: "artifact-case", artifacts: [{ path: "outputs/result.md", content: "usable content", summary: "result" }] }],
    }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.runtime, "local-process-filesystem");
  assert.equal(result.network, "denied");
  assert.equal(result.artifactChecks[0].passed, true);
  assert.equal(result.scriptTests.passed, true);
  assert.match(result.scriptTests.detail, /Ran 1 test/);

  const scriptSuite = "import subprocess\nimport sys\nimport unittest\n\nclass Smoke(unittest.TestCase):\n    def test_ok(self):\n        self.assertTrue(True)\n\n    def test_nested_script_process(self):\n        result = subprocess.run([sys.executable, '-I', '-c', 'print(42)'], capture_output=True, text=True)\n        self.assertEqual(result.returncode, 0, result.stderr)\n        self.assertEqual(result.stdout.strip(), '42')\n";
  const scriptFiles = {
    "evals/script-tests/test_smoke.py": scriptSuite,
    "evals/capability-manifest.json": JSON.stringify({ capabilities: [{ id: "deterministic-check", kind: "script" }] }),
  };
  const scriptResult = await verifyBundleScriptTests({
    endpoint: `http://127.0.0.1:${port}/verify`,
    skillFiles: scriptFiles,
  });
  assert.equal(scriptResult.status, "executed");
  assert.equal(scriptResult.passed, true);

  const verified = await verifyExecutionsInLocalSandbox({
    endpoint: `http://127.0.0.1:${port}/verify`,
    skillFiles: scriptFiles,
    cases: [
      { id: "artifact-case", family: "integration", category: "artifact", shouldTrigger: true, prompt: "create file", context: {}, capabilityIds: ["file-export"], expected: { behaviors: [], mustNot: [], artifacts: ["outputs/*.md"] }, graders: ["artifact_checker"], split: "selection" },
      { id: "script-case", family: "capability", category: "core_capability", shouldTrigger: true, prompt: "verify script", context: {}, capabilityIds: ["deterministic-check"], expected: { behaviors: [], mustNot: [], artifacts: [] }, graders: ["core_capability"], split: "selection" },
    ],
    executions: [
      { runId: "run-1", caseId: "artifact-case", configuration: "with_skill", runIndex: 1, prompt: "create file", output: "done", triggered: true, artifacts: [{ path: "outputs/result.md", content: "usable content", summary: "result", verified: false }], trace: [], durationMs: 10, outputChars: 4 },
      { runId: "run-2", caseId: "script-case", configuration: "with_skill", runIndex: 1, prompt: "verify script", output: "done", triggered: true, artifacts: [], trace: [], durationMs: 10, outputChars: 4 },
    ],
  });
  assert.equal(verified[0].artifacts[0].verified, true);
  assert.ok(verified[0].trace.some((item) => item.includes("外部 Tool/MCP：本地沙箱未配置")));
  assert.ok(verified[0].trace.some((item) => item.includes("本用例不验证确定性脚本")));
  assert.ok(verified[1].trace.some((item) => item.includes("本用例所覆盖的脚本测试：通过")));

  const failed = await fetch(`http://127.0.0.1:${port}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skillFiles: { "evals/script-tests/test_failure.py": "import unittest\n\nclass Failure(unittest.TestCase):\n    def test_failure(self):\n        self.assertEqual(1, 2)\n" },
      cases: [],
      executions: [],
    }),
  });
  const failedResult = await failed.json();
  assert.equal(failedResult.scriptTests.status, "executed");
  assert.equal(failedResult.scriptTests.passed, false);
  assert.match(failedResult.scriptTests.detail, /FAILED \(failures=1\)/);
});
