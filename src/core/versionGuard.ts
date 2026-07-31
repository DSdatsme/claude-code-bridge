import { exec as nodeExec } from 'node:child_process';
import { promisify } from 'node:util';

export interface VersionCheckResult {
  installed: boolean;
  version?: string;
  warning?: string;
}

export type ExecFn = (command: string) => Promise<{ stdout: string }>;

const defaultExecFn: ExecFn = promisify(nodeExec);

// NOTE: Anthropic's docs say `--bare` mode is slated to become the default
// for `-p` in a future Claude Code release, which would silently break
// subscription-credential reading. Once that release ships with a known
// version number, add a max-supported-version check here that warns when
// the installed CLI is at or past it.
export async function checkClaudeCode(
  options: { binaryPath?: string; execFn?: ExecFn } = {}
): Promise<VersionCheckResult> {
  const binaryPath = options.binaryPath ?? 'claude';
  const execFn = options.execFn ?? defaultExecFn;

  let stdout: string;
  try {
    ({ stdout } = await execFn(`${binaryPath} --version`));
  } catch {
    return {
      installed: false,
      warning: `Could not run "${binaryPath} --version". Is Claude Code installed and on PATH?`,
    };
  }

  // NOTE: Take the LAST version-like match, not the first, to avoid mismatches with
  // tool-chain noise (npm update notices, deprecation warnings) that may appear before
  // the CLI's own version string. This remains a best-effort heuristic pending real
  // captured `claude --version` output for verification.
  const matches = [...stdout.matchAll(/(\d+\.\d+\.\d+)/g)];
  if (matches.length === 0) {
    return {
      installed: true,
      warning: `Could not parse a version number from "${binaryPath} --version" output: ${stdout.trim()}`,
    };
  }

  const lastMatch = matches[matches.length - 1];
  return { installed: true, version: lastMatch[1] };
}
