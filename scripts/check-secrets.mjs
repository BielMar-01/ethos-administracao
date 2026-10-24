import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function suspicious(text) {
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /(?:sb_secret_|ghp_|github_pat_)[a-zA-Z0-9_]{25,}/.test(text) ||
    /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]+@(?!localhost[:/]|127\.0\.0\.1[:/]|\[::1\])[^\s]+/.test(
      text,
    ) ||
    /NEXT_PUBLIC_[A-Z_]*(?:DATABASE|PASSWORD|ENCRYPTION_KEY)\s*=\s*[^\s#]+/.test(
      text,
    )
  );
}
export function scan() {
  const files = execFileSync(
    "git",
    ["ls-files", "-co", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  const bad = [];
  for (const file of new Set(files)) {
    if (
      /(?:^|\/)(?:\.env(?:\.|$)(?!example$)|\.secrets|\.backups)(?:\/|$)/.test(
        file,
      )
    ) {
      bad.push(file);
      continue;
    }
    const bytes = readFileSync(file);
    if (bytes.includes(0)) continue;
    let content = bytes.toString("utf8");
    // Exact synthetic credentials in negative URL parser tests, not whole-file exclusions.
    if (
      /^(packages\/database\/tests\/(activation-guards|database|supabase-target)|apps\/api\/tests\/environment)\.test\.mjs$/.test(
        file,
      )
    )
      content = content.replace(
        /postgres(?:ql)?:\/\/[^\s"`]+:(?:fake-password|sentinel-secret|x|fixture)@[^\s"`]+/g,
        "SYNTHETIC_TEST_URL",
      );
    if (suspicious(content)) bad.push(file);
  }
  if (bad.length) throw Error(`SECRET_SCAN_REJECTED_FILES: ${bad.join(", ")}`);
  console.log(
    JSON.stringify({
      secretScan: "passed",
      files: new Set(files).size,
      scope:
        "tracked and unignored working tree; pattern scan, not proof of absence",
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  scan();
