// Operator CLI only. --approved is not a substitute for explicit user authorization.
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@ethos/database";
import {
  bootstrapRequest,
  bootstrapAdministrativeUser,
} from "../dist/auth/admin-bootstrap.js";
import {
  root,
  projectId,
  sourceConnection,
  protectedWrite,
} from "../../../packages/database/scripts/access-preparation-common.mjs";
const args = process.argv.slice(2),
  mode = args[0];
let database;
try {
  if (!["plan", "apply"].includes(mode))
    throw Error("EXPLICIT_BOOTSTRAP_MODE_REQUIRED");
  if (mode === "apply" && !args.includes("--approved"))
    throw Error("EXPLICIT_APPROVAL_REQUIRED");
  if (!args.includes(`--project=${projectId}`))
    throw Error("CONFIRMED_PROJECT_REQUIRED");
  const request = args
    .find((a) => a.startsWith("--request-file="))
    ?.slice("--request-file=".length);
  if (!request) throw Error("PROTECTED_REQUEST_FILE_REQUIRED");
  const path = realpathSync(resolve(root, request)),
    secrets = realpathSync(resolve(root, ".secrets")) + sep,
    stat = lstatSync(path);
  if (!path.startsWith(secrets) || !stat.isFile() || stat.size > 16384)
    throw Error("PROTECTED_REQUEST_FILE_REQUIRED");
  if (process.platform === "win32") {
    const literal = "'" + path.replaceAll("'", "''") + "'";
    const count = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $acl=Get-Acl -LiteralPath ${literal}; @($acl.Access | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin @($sid,'S-1-5-18') }).Count`,
      ],
      { encoding: "utf8" },
    ).trim();
    if (count !== "0") throw Error("REQUEST_FILE_ACL_TOO_BROAD");
  } else if (stat.mode & 0o077) throw Error("REQUEST_FILE_MODE_TOO_BROAD");
  const value = bootstrapRequest.parse(
    JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")),
  );
  if (mode === "plan") {
    console.log(
      JSON.stringify({
        valid: true,
        kind: value.kind,
        role: value.role ?? null,
        organizationId: value.organizationId ?? null,
        emailPrinted: false,
        sourceConnection: false,
      }),
    );
  } else {
    let url;
    if (args.includes("--local-test")) {
      const port = args.includes("--port=55440") ? "55440" : "55439";
      url = `postgresql://postgres:ethos-local-disposable@127.0.0.1:${port}/ethos_auth_test`;
    } else {
      const checked = await sourceConnection();
      try {
        const state = (
          await checked.client.query(
            "SELECT count(*)::int AS n FROM ethos_technical._prisma_migrations WHERE migration_name='20261024000000_mutation_consistency' AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
          )
        ).rows[0];
        if (state.n !== 1) throw Error("AUTH_DATABASE_ACTIVATION_REQUIRED");
        url = checked.url.toString();
      } finally {
        await checked.client.query("ROLLBACK").catch(() => {});
        await checked.client.end();
      }
    }
    database = createDatabaseClient({
      connectionString: url,
      allowLocalPlaintext: args.includes("--local-test"),
      maxConnections: 1,
    });
    const handoff = resolve(
      root,
      ".secrets",
      `access-handoff-${randomUUID()}.json`,
    );
    const result = await bootstrapAdministrativeUser(
      database.prisma,
      value,
      async (data) => {
        protectedWrite(
          handoff,
          Buffer.from(JSON.stringify({ ...data, email: value.email }, null, 2)),
        );
      },
    );
    console.log(
      JSON.stringify({
        provisioned: true,
        kind: result.kind,
        emailConfirmationRequired: true,
        mfaRequired: result.mfaRequired,
        handoffWritten: true,
        secretsPrinted: false,
      }),
    );
  }
} catch (error) {
  const known = [
    "EXPLICIT_BOOTSTRAP_MODE_REQUIRED",
    "EXPLICIT_APPROVAL_REQUIRED",
    "CONFIRMED_PROJECT_REQUIRED",
    "PROTECTED_REQUEST_FILE_REQUIRED",
    "REQUEST_FILE_ACL_TOO_BROAD",
    "REQUEST_FILE_MODE_TOO_BROAD",
    "AUTH_DATABASE_ACTIVATION_REQUIRED",
    "INITIAL_SUPER_ADMIN_ALREADY_PROVISIONED",
    "EXISTING_IDENTITY_REQUIRES_SEPARATE_AUTHORIZATION",
    "ACTIVE_ORGANIZATION_REQUIRED",
    "ADMINISTRATIVE_CONNECTION_REQUIRED",
    "ARCHIVED_ROLE_REQUIRES_REVIEW",
  ];
  console.error(
    JSON.stringify({
      failed: true,
      code: known.includes(error.message)
        ? error.message
        : "BOOTSTRAP_FAILED_REVIEW_PROTECTED_HANDOFF",
      noAutomaticRetry: true,
    }),
  );
  process.exitCode = 1;
} finally {
  if (database) await database.disconnect();
}
