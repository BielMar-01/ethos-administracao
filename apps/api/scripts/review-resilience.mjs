import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { withOrganization } from "@ethos/database";
import { securityFixture } from "../tests/helpers/security-fixtures.mjs";
import { execFileSync } from "node:child_process";
const f = await securityFixture();
try {
  const a = await f.account("ADMIN_ORGANIZACAO");
  await f.admin.owner.createMany({
    data: Array.from({ length: 250 }, (_, n) => ({
      organizationId: a.org,
      name: `Isolated load ${n}`,
      kind: "INDIVIDUAL",
    })),
  });
  const rssBefore = process.memoryUsage().rss,
    samples = [];
  for (let batch = 0; batch < 10; batch++)
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        const start = performance.now();
        const result = await f.request(a, "owners?pageSize=100");
        samples.push(performance.now() - start);
        assert.equal(result.data.length, 100);
        assert.equal(result.meta.total, 250);
      }),
    );
  samples.sort((a, b) => a - b);
  const context = { organizationId: a.org, userId: a.user.id };
  const plans = await withOrganization(f.tenant, context, async (tx) => {
    const owner =
      await tx.$queryRaw`EXPLAIN (FORMAT JSON, ANALYZE, BUFFERS) SELECT id FROM ethos."Owner" WHERE "organizationId" = ${a.org}::uuid ORDER BY "createdAt", id LIMIT 100`;
    const revisions =
      await tx.$queryRaw`EXPLAIN (FORMAT JSON, ANALYZE, BUFFERS) SELECT revision FROM ethos_technical."ResourceRevision" WHERE "organizationId" = ${a.org}::uuid AND resource='owners'`;
    // Only structural metrics, never query text, row values or identifiers.
    const summarize = (rows) => {
      const q = rows[0]["QUERY PLAN"][0];
      return {
        node: q.Plan["Node Type"],
        executionMs: q["Execution Time"],
        planningMs: q["Planning Time"],
      };
    };
    return { owner: summarize(owner), revisions: summarize(revisions) };
  });
  // Transaction-local timeout proves cancellation and subsequent connection reuse.
  await assert.rejects(
    withOrganization(f.tenant, context, async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout='100ms'`;
      await tx.$queryRaw`SELECT pg_sleep(0.3)::text`;
    }),
  );
  await f.request(a, "owners?pageSize=1");
  // Kill only idle local runtime connections, never any production session.
  await f.admin
    .$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename='ethos_tenant_runtime' AND state='idle'`;
  let recovered = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await f.app.inject({
      url: "/api/v1/owners?pageSize=1",
      headers: { cookie: a.cookie },
    });
    if (r.statusCode === 200) {
      recovered = true;
      break;
    }
    assert.ok([500, 503].includes(r.statusCode));
    assert.equal(JSON.stringify(r.json()).includes("postgresql://"), false);
  }
  assert.equal(recovered, true);
  let serverOutageRecovered = false;
  if (process.argv.includes("--server-outage")) {
    const name = "ethos-security-011";
    const image = execFileSync(
      "docker",
      ["inspect", "--format", "{{.Config.Image}}", name],
      { encoding: "utf8" },
    ).trim();
    assert.equal(image, "postgres:17.11");
    try {
      execFileSync("docker", ["stop", "--time", "2", name], { stdio: "pipe" });
      const unavailable = await f.app.inject({
        url: "/api/v1/owners",
        headers: { cookie: a.cookie },
      });
      assert.ok([500, 503].includes(unavailable.statusCode));
      assert.equal(
        JSON.stringify(unavailable.json()).includes("postgresql://"),
        false,
      );
    } finally {
      execFileSync("docker", ["start", name], { stdio: "pipe" });
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await f.app.inject({
        url: "/api/v1/owners?pageSize=1",
        headers: { cookie: a.cookie },
      });
      if (response.statusCode === 200) {
        serverOutageRecovered = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(serverOutageRecovered, true);
  }
  const connections = await f.admin
    .$queryRaw`SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND usename IN ('ethos_auth_runtime','ethos_tenant_runtime')`;
  const report = {
    isolated: true,
    requests: samples.length,
    concurrency: 4,
    fixtureRows: 250,
    latencyMs: {
      p50: samples[Math.floor(samples.length * 0.5)],
      p95: samples[Math.floor(samples.length * 0.95)],
      max: samples.at(-1),
    },
    rssBytes: { before: rssBefore, after: process.memoryUsage().rss },
    runtimeConnectionsObserved: connections[0].count,
    plans,
    timeoutRollbackAndReuse: true,
    idleConnectionLossRecovered: recovered,
    serverOutageRecovered,
    limitations: [
      "loopback, warm process and small synthetic dataset",
      "pool observation includes separate browser fixture server",
      "not a sustained load or production capacity test",
      "revision lookup is one batched query per page; SQL call count was not instrumented",
    ],
  };
  writeFileSync(
    new URL("../../../docs/etapa-0.11-resilience.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await f.close();
}
