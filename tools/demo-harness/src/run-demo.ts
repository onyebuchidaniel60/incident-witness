import { runDemo } from "./demo.js";

runDemo()
  .then((result) => {
    if (result.validRun.exitCode !== 0 || result.tamperedRun.exitCode !== 1) {
      process.exitCode = 1;
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "demo harness failed";
    process.stderr.write(`[demo] FAILED: ${message}\n`);
    process.exitCode = 1;
  });
