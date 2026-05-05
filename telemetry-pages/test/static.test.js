import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("telemetry pages dashboard", () => {
  it("loads a static app wired to the deployed Worker admin APIs", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const app = await readFile(new URL("../app.js", import.meta.url), "utf8");

    for (const id of [
      "api-endpoint",
      "admin-token",
      "day-filter",
      "overview",
      "chart",
      "users-body",
      "events-body",
      "toast"
    ]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }

    assert.match(app, /https:\/\/autotd-telemetry\.autotd-buaa\.workers\.dev/);
    assert.match(app, /Authorization/);
    assert.match(app, /Bearer/);
    assert.match(app, /\/admin\/api\/summary/);
    assert.match(app, /\/admin\/api\/users/);
    assert.match(app, /\/admin\/api\/events/);
    assert.match(app, /\/admin\/api\/daily/);
  });
});
