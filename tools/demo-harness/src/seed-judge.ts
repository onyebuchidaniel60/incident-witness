import { seedJudgeDemo } from "./demo.js";

seedJudgeDemo()
  .then((result) => {
    process.stdout.write(
      `[judge-seed] Judge demo data ready. Host ${result.hostId}; incident ${result.incidentId}; assessment ${result.assessment}/${result.evidenceGrade}.\n`,
    );
    process.stdout.write("[judge-seed] Sign in through the home-page Judge Demo button.\n");
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "judge demo seed failed";
    process.stderr.write(`[judge-seed] FAILED: ${message}\n`);
    process.exitCode = 1;
  });
