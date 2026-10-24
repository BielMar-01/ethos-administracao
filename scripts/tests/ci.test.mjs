import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("CI remains read-only, pinned and isolated, without publication or secret expressions", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const actions = [...workflow.matchAll(/uses:\s+([^\s]+)/g)].map(
    (match) => match[1],
  );
  assert.equal(actions.length, 3);
  assert.ok(actions.every((action) => /@[a-f0-9]{40}$/.test(action)));
  assert.ok(workflow.includes("contents: read"));
  assert.ok(workflow.includes("persist-credentials: false"));
  assert.ok(workflow.includes("--frozen-lockfile"));
  assert.equal(
    /secrets\.|pull_request_target|write-all|migrate deploy|vercel deploy|docker push/.test(
      workflow,
    ),
    false,
  );
  assert.equal(
    JSON.parse(
      readFileSync(new URL("../../apps/web/vercel.json", import.meta.url)),
    ).git.deploymentEnabled,
    false,
  );
});
