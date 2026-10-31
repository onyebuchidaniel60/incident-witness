import { execFile } from "node:child_process";

export type FixedCommandOptions = {
  timeoutMs: number;
  maxBufferBytes: number;
};

export type FixedCommandRunner = (
  file: string,
  args: readonly string[],
  options: FixedCommandOptions,
) => Promise<string>;

/**
 * Runs a fixed executable with fixed arguments. No shell, no caller-supplied command line,
 * bounded timeout and bounded output.
 */
export const runFixedCommand: FixedCommandRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      {
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes,
        encoding: "utf8",
        shell: false,
        killSignal: "SIGKILL",
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
