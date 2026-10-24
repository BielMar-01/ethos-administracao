import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalConstraints,
  canonicalTableAcl,
} from "../scripts/normalize-business-backup.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("preparation cannot activate grants or deploy even if supplied an approval flag", () => {
  for (const mode of ["apply", "grants", "deploy", "credentials"]) {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL(
            "../scripts/prepare-business-activation.mjs",
            import.meta.url,
          ),
        ),
        mode,
        "--approved",
      ],
      {
        env: {
          ...process.env,
          DIRECT_DATABASE_URL: "sentinel-secret-not-a-connection",
        },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /READ_ONLY_PREPARATION_MODE_REQUIRED/);
    assert.doesNotMatch(result.stderr, /sentinel-secret/);
  }
});
test("backup comparison accepts only equivalent literal CHECK casts", () => {
  const a = [
    [
      "ethos_identity",
      "T",
      "C",
      true,
      "CHECK ((purpose = ANY ((ARRAY['VERIFY_EMAIL'::character varying, 'RESET_PASSWORD'::character varying])::text[])))",
    ],
  ];
  const b = [
    [
      "ethos_identity",
      "T",
      "C",
      true,
      "CHECK ((purpose = ANY (ARRAY[('VERIFY_EMAIL'::character varying)::text, ('RESET_PASSWORD'::character varying)::text])))",
    ],
  ];
  assert.deepEqual(canonicalConstraints(a), canonicalConstraints(b));
  assert.notDeepEqual(
    canonicalConstraints(a),
    canonicalConstraints([
      [...b[0].slice(0, 4), b[0][4].replace("RESET_PASSWORD", "OTHER")],
    ]),
  );
  assert.notDeepEqual(
    canonicalConstraints(a),
    canonicalConstraints([[...b[0].slice(0, 3), false, b[0][4]]]),
  );
});
test("backup comparison preserves nondefault ACLs and ownership", () => {
  const a = [["ethos", "T", "postgres", "{postgres=arwdDxtm/postgres}"]];
  assert.deepEqual(canonicalTableAcl(a), [["ethos", "T", "postgres", null]]);
  for (const acl of [
    "{postgres=arwdDxtm/postgres,=r/postgres}",
    "{runtime=r/postgres}",
    "{postgres=arwd/postgres}",
  ])
    assert.notDeepEqual(
      canonicalTableAcl(a),
      canonicalTableAcl([["ethos", "T", "postgres", acl]]),
    );
  assert.notDeepEqual(
    canonicalTableAcl(a),
    canonicalTableAcl([["ethos", "T", "runtime", null]]),
  );
});
