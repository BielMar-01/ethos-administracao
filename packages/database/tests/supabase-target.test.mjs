import test from "node:test";
import assert from "node:assert/strict";
import { supabaseTarget } from "../scripts/supabase-target.mjs";

test("confirmed direct IPv6 hostname and session pooler use different role formats", () => {
  assert.equal(
    supabaseTarget(
      "postgresql://postgres:x@db.project.supabase.co:5432/postgres",
      "project",
    ).direct,
    true,
  );
  assert.equal(
    supabaseTarget(
      "postgresql://postgres.project:x@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      "project",
    ).direct,
    false,
  );
});
test("target validation rejects unconfirmed, mismatched, spoofed and transaction endpoints", () => {
  for (const [url, expected] of [
    ["postgresql://postgres:x@db.project.supabase.co:5432/postgres", ""],
    ["postgresql://postgres:x@db.project.supabase.co:5432/postgres", "other"],
    [
      "postgresql://postgres.project:x@db.project.supabase.co:5432/postgres",
      "project",
    ],
    [
      "postgresql://postgres.project:x@aws-0-us-east-1.pooler.supabase.com.evil.test:5432/postgres",
      "project",
    ],
    [
      "postgresql://postgres.project:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      "project",
    ],
  ])
    assert.throws(
      () => supabaseTarget(url, expected),
      /CONFIRMED_SUPABASE_TARGET_REQUIRED/,
    );
});
