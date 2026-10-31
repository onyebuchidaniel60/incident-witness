#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emitKeypressEvents } from "node:readline";

import { HostAgent } from "./agent.js";
import { defaultConfigDir, hasAgentConfig, UPS_DEVICE_PATTERN } from "./config.js";
import { enrollAgent, EnrollmentError } from "./enroll.js";
import { AGENT_VERSION, createLogger, silentLogger, type LogLevel } from "./log.js";

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

const HELP = `Incident Witness host agent ${AGENT_VERSION}

Usage:
  iw-agent enroll [--api-url <url>] [--config-dir <path>] [--ups-device <alias>]
  iw-agent run [--incident <uuid>] [--config-dir <path>] [--ups-device <alias>]
  iw-agent status [--config-dir <path>]
  iw-agent version
  iw-agent help

The enrollment code is read interactively from standard input. It is never accepted
as a command-line argument or environment variable.

The agent runs unprivileged. It reads a fixed allow-list of local telemetry through
fixed executables and never executes a shell. An active evidence session ID must be
supplied with --incident for evidence events; operational presence runs independently.
`;

type ParsedArgs = {
  command: string;
  options: Map<string, string>;
};

const OPTION_NAMES = new Set([
  "--api-url",
  "--config-dir",
  "--ups-device",
  "--incident",
  "--log-level",
]);

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0];
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help", options: new Map() };
  }

  const options = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;

    if (token === "--help" || token === "-h") {
      return { command: "help", options: new Map() };
    }
    if (!OPTION_NAMES.has(token)) {
      throw new CliError(`Unknown option: ${token}`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliError(`Option ${token} requires a value`);
    }
    options.set(token, value);
    index += 1;
  }

  return { command, options };
}

function getConfigDir(options: Map<string, string>): string {
  const value = options.get("--config-dir");
  return value ? resolve(value) : defaultConfigDir();
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (value === undefined) return "info";
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  throw new CliError("The log level must be debug, info, warn or error");
}

function requireEnrolledConfig(configDir: string): void {
  if (!hasAgentConfig(configDir)) {
    throw new CliError(
      `No enrolled agent configuration was found in ${configDir}. Run iw-agent enroll first.`,
    );
  }
}

async function readEnrollmentCode(): Promise<string> {
  if (!process.stdin.isTTY) {
    const contents = readFileSync(0, "utf8");
    const firstLine = contents.split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (!firstLine) throw new CliError("No enrollment code was provided on standard input");
    return firstLine;
  }

  return new Promise<string>((resolvePromise, rejectPromise) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";

    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write("Enrollment code (input hidden): ");

    const cleanup = (): void => {
      stdin.removeListener("keypress", onKeypress);
      stdin.setRawMode(false);
      stdin.pause();
    };

    const onKeypress = (
      text: string | undefined,
      key: { name?: string; ctrl?: boolean; meta?: boolean },
    ): void => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        stdout.write("\n");
        rejectPromise(new CliError("Enrollment cancelled"));
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        cleanup();
        stdout.write("\n");
        resolvePromise(value.trim());
        return;
      }

      if (key.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }

      if (text && !key.ctrl && !key.meta) {
        value += text;
      }
    };

    stdin.on("keypress", onKeypress);
  });
}

function printStatus(status: ReturnType<HostAgent["status"]>, configDir: string): void {
  const output = {
    configDir,
    hostId: status.hostId,
    sourceKeyId: status.sourceKeyId,
    apiBaseUrl: status.apiBaseUrl,
    incidentId: status.incidentId,
    upsDevice: status.upsDevice,
    nextEventSequence: status.nextEventSequence,
    nextPresenceSequence: status.nextPresenceSequence,
    uploadHalted: status.uploadHalted,
    presenceHalted: status.presenceHalted,
    spool: status.spool,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function runAgent(
  configDir: string,
  incidentId: string | undefined,
  upsDevice: string | undefined,
  logLevel: LogLevel,
): Promise<void> {
  requireEnrolledConfig(configDir);

  if (upsDevice !== undefined && !UPS_DEVICE_PATTERN.test(upsDevice)) {
    throw new CliError("The UPS device alias contains unsupported characters");
  }

  const logger = createLogger({ level: logLevel });
  const agent = new HostAgent({
    configDir,
    ...(incidentId === undefined ? {} : { incidentId }),
    ...(upsDevice === undefined ? {} : { upsDevice }),
    logger,
  });

  agent.start();
  const status = agent.status();
  logger.info("Agent is running", {
    hostId: status.hostId,
    incidentId: status.incidentId,
    spoolEvents: status.spool.eventCount,
    spoolBytes: status.spool.totalBytes,
  });

  let stopping = false;
  await new Promise<void>((resolvePromise) => {
    const shutdown = (signal: string): void => {
      if (stopping) {
        logger.error("Forced exit requested while the agent is stopping", { signal });
        process.exit(1);
      }

      stopping = true;
      logger.info("Stopping host agent", { signal });
      void agent.stop().finally(() => resolvePromise());
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  });
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.command === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed.command === "version") {
    process.stdout.write(`iw-agent ${AGENT_VERSION}\n`);
    return 0;
  }

  const configDir = getConfigDir(parsed.options);

  if (parsed.command === "enroll") {
    const apiUrl = parsed.options.get("--api-url") ?? "http://localhost:4000";
    const upsDevice = parsed.options.get("--ups-device");
    const code = await readEnrollmentCode();
    const summary = await enrollAgent({
      configDir,
      apiBaseUrl: apiUrl,
      enrollmentCode: code,
      ...(upsDevice === undefined ? {} : { upsDevice }),
    });

    process.stdout.write(
      `Enrolled host ${summary.hostId}.\n` +
        `Configuration and key material were written to ${summary.configDir} with owner-only permissions.\n` +
        "The device credential and private key were not printed. Start the agent with iw-agent run.\n",
    );
    return 0;
  }

  if (parsed.command === "run") {
    await runAgent(
      configDir,
      parsed.options.get("--incident"),
      parsed.options.get("--ups-device"),
      parseLogLevel(parsed.options.get("--log-level")),
    );
    return 0;
  }

  if (parsed.command === "status") {
    requireEnrolledConfig(configDir);
    const agent = new HostAgent({ configDir, logger: silentLogger });
    try {
      printStatus(agent.status(), configDir);
    } finally {
      agent.close();
    }
    return 0;
  }

  throw new CliError(`Unknown command: ${parsed.command}. Run iw-agent help.`);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof EnrollmentError) {
      process.stderr.write(
        `${error.message}${error.code ? ` (code: ${error.code})` : ""}${
          error.status ? ` (status: ${error.status})` : ""
        }\n`,
      );
    } else if (error instanceof CliError) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write(
        "The host agent command failed. Check the local configuration and logs.\n",
      );
    }
    process.exitCode = 1;
  });
