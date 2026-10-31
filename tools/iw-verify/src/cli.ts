#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { formatReport } from "./report.js";
import { DEFAULT_TRUST_SET_PATH, loadTrustSet } from "./trust.js";
import { verifyBundle } from "./verify.js";

export const CLI_VERSION = "0.1.0";

const USAGE = `Usage: iw-verify [--trust <trusted-platform-keys.json>] <bundle.json>

Verify an exported Incident Witness evidence bundle entirely offline.

Exit codes:
  0  bundle schema, digest, signatures, certificates and ordering are valid
  1  bundle is invalid or was modified
  2  bundle file is missing, unreadable or not valid JSON (or the trust set is invalid)

Options:
  --trust <path>  Use a specific pinned platform-key trust set
  --help          Show this help
  --version       Show the CLI version

The CLI never uploads the bundle or makes a network request. A valid result
confirms integrity and signatures relative to the pinned keys; it does not
prove sensor accuracy, key security or the truth of an inferred cause.
`;

type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

function defaultIo(): CliIo {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

export async function runCli(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  let bundlePath: string | null = null;
  let trustPath = DEFAULT_TRUST_SET_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === "--help" || argument === "-h") {
      io.stdout(USAGE);
      return 0;
    }
    if (argument === "--version" || argument === "-v") {
      io.stdout(`${CLI_VERSION}\n`);
      return 0;
    }
    if (argument === "--trust") {
      const value = argv[index + 1];
      if (!value) {
        io.stderr("iw-verify: --trust requires a file path\n");
        return 2;
      }
      trustPath = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--trust=")) {
      const value = argument.slice("--trust=".length);
      if (!value) {
        io.stderr("iw-verify: --trust requires a file path\n");
        return 2;
      }
      trustPath = value;
      continue;
    }
    if (argument.startsWith("-") && argument !== "-") {
      io.stderr(`iw-verify: unknown option ${argument}\n\n${USAGE}`);
      return 2;
    }
    if (bundlePath !== null) {
      io.stderr("iw-verify: expected exactly one bundle file path\n\n" + USAGE);
      return 2;
    }
    bundlePath = argument;
  }

  if (bundlePath === null) {
    io.stderr(`iw-verify: missing bundle file path\n\n${USAGE}`);
    return 2;
  }

  let raw: string;
  try {
    raw = await readFile(bundlePath, "utf8");
  } catch {
    io.stderr(`iw-verify: cannot read bundle file: ${bundlePath}\n`);
    return 2;
  }

  let bundle: unknown;
  try {
    bundle = JSON.parse(raw);
  } catch {
    io.stderr(`iw-verify: bundle file is not valid JSON: ${bundlePath}\n`);
    return 2;
  }

  let trust;
  try {
    trust = await loadTrustSet(trustPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid trusted key set";
    io.stderr(`iw-verify: ${message}\n`);
    return 2;
  }

  const report = verifyBundle(bundle, trust);
  io.stdout(formatReport(report, bundlePath));
  return report.valid ? 0 : 1;
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      process.stderr.write("iw-verify: unexpected verification failure\n");
      process.exitCode = 2;
    });
}
