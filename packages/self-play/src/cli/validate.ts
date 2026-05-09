#!/usr/bin/env node
import { validateDataset } from "../validator.ts";

async function main(): Promise<void> {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write("Usage: tengen-validate <dir> [--require-terminal]\n");
    process.exit(2);
  }
  const requireTerminal = process.argv.includes("--require-terminal");
  const report = await validateDataset(dir, { requireTerminal });

  for (const issue of report.issues) {
    process.stderr.write(`[${issue.kind}] ${issue.file}: ${issue.message}\n`);
  }

  process.stdout.write(
    `Validated ${report.ok + report.failed} records: ${report.ok} ok, ${report.failed} failed.\n`,
  );
  if (report.manifest) {
    process.stdout.write(
      `Manifest: rules ${report.manifest.rulesPackageVersion}, ${report.manifest.matchCount} matches, ${report.manifest.bots.length} bots.\n`,
    );
  } else {
    process.stdout.write("Manifest: (none)\n");
  }
  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`tengen-validate failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
