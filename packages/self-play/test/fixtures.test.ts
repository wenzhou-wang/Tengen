import { strict as assert } from "node:assert";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { validateDataset } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "..", "fixtures");

describe("evaluation fixtures", () => {
  it("the committed fixture set replays cleanly with no validator issues", async () => {
    const report = await validateDataset(fixturesDir);
    assert.equal(report.failed, 0, `unexpected failures: ${JSON.stringify(report.issues, null, 2)}`);
    assert.ok(report.ok > 0, "expected at least one fixture record");
    assert.ok(report.manifest, "fixture manifest should be present");
    assert.equal(report.manifest?.matchCount, report.ok);
  });
});
