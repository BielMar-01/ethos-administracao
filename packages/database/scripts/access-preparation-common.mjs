import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";
import { isIP } from "node:net";
import { poolConfiguration } from "../dist/settings.js";
import { supabaseTarget } from "./supabase-target.mjs";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
export const projectId = "wszrtvgjcgpgntsssbhd";
export function protect(path, directory = false) {
  assert.ok(resolve(path).startsWith(resolve(root) + sep));
  if (process.platform !== "win32") return;
  const sid = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    ],
    { encoding: "utf8" },
  ).trim();
  assert.match(sid, /^S-1-[0-9-]+$/);
  const rights = directory ? "(OI)(CI)F" : "F";
  execFileSync(
    "icacls.exe",
    [
      path,
      "/inheritance:r",
      "/grant:r",
      `*${sid}:${rights}`,
      `*S-1-5-18:${rights}`,
    ],
    { stdio: "pipe" },
  );
  execFileSync(
    "icacls.exe",
    [path, "/remove:g", "*S-1-1-0", "*S-1-5-11", "*S-1-5-32-545"],
    { stdio: "pipe" },
  );
}
export function protectedDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  protect(path, true);
}
export function protectedWrite(path, bytes) {
  writeFileSync(path, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
  protect(path);
  writeFileSync(path, bytes);
}
export function native(exe, args, options = {}) {
  const r = spawnSync(exe, args, {
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (r.status !== 0) throw Error("LOCAL_NATIVE_OPERATION_FAILED");
  return r.stdout;
}
export async function sourceConnection() {
  config({ path: new URL("../.env", import.meta.url), quiet: true });
  const checked = supabaseTarget(process.env.DIRECT_DATABASE_URL, projectId),
    url = new URL(checked.url);
  url.hostname = `db.${projectId}.supabase.co`;
  url.username = decodeURIComponent(url.username).split(".")[0];
  url.search = "";
  const client = new pg.Client(poolConfiguration(url.toString(), 1));
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const stream = client.connection.stream;
    assert.ok(
      stream.encrypted && stream.authorized && isIP(stream.remoteAddress) === 6,
    );
    assert.equal(
      (
        await client.query(
          "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
        )
      ).rows[0].ssl,
      true,
    );
    return { client, url };
  } catch (error) {
    await client.end();
    throw error;
  }
}
