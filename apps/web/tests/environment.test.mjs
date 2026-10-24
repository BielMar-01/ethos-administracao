import test from "node:test";
import assert from "node:assert/strict";
import { webConfiguration } from "../lib/environment.ts";
test("BFF refuses missing remote origins, credentials and public secrets", () => {
  assert.equal(webConfiguration({}).api, "http://127.0.0.1:3333");
  for (const env of [
    { APP_ENV: "staging", NODE_ENV: "production" },
    { DATABASE_URL: "forbidden" },
    { NEXT_PUBLIC_DATABASE_URL: "forbidden" },
    { ETHOS_API_ORIGIN: "https://remote.invalid" },
    { ETHOS_WEB_ORIGIN: "http://localhost:3000/path" },
  ])
    assert.throws(() => webConfiguration(env));
  assert.equal(
    webConfiguration({
      APP_ENV: "production",
      NODE_ENV: "production",
      ETHOS_API_ORIGIN: "https://api.example.invalid",
      ETHOS_WEB_ORIGIN: "https://app.example.invalid",
    }).api,
    "https://api.example.invalid",
  );
});
