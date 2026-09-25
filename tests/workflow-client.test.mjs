import assert from "node:assert/strict";
import test from "node:test";
import { workflowRequest, DurableWorkflowJournal } from "../app/workflow-client.ts";

test("journal deadline covers hung headers and hung response bodies", async (t) => {
  for (const bodyHangs of [false, true]) {
    let signal;
    t.mock.method(globalThis, "fetch", async (_url, init) => {
      signal = init.signal;
      if (!bodyHangs) return new Promise(() => {});
      return { ok: true, json: () => new Promise(() => {}) };
    });
    await assert.rejects(workflowRequest({ action: "claim" }, 15), /timed out/);
    assert.equal(signal.aborted, true);
    t.mock.restoreAll();
  }
});

test("journal returns valid snapshots and rejects malformed successful responses", async (t) => {
  const snapshot = { run: { id: "run", currentNodeId: "intent", status: "running" }, nodes: [] };
  t.mock.method(globalThis, "fetch", async () => Response.json(snapshot));
  assert.deepEqual(await workflowRequest({ action: "start" }, 100), snapshot);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => Response.json({}));
  await assert.rejects(workflowRequest({ action: "start" }, 100), /incomplete snapshot/);
});

test("journal outage is latched for this run, without replaying uncertain writes", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls > 1) throw new Error("offline");
    return Response.json({ run: { id: "run", currentNodeId: "intent", status: "running" }, nodes: [] });
  });
  const journal = await DurableWorkflowJournal.start("build", {});
  assert.ok(journal);
  assert.equal(await journal.complete("intent", {}), false);
  assert.equal(await journal.complete("bundle", {}), false);
  assert.equal(await journal.fail(new Error("build failed")), false);
  assert.equal(calls, 2);
});
