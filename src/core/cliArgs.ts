import type { ClaudeCodeOptions } from './types.js';

/**
 * Builds the argv for a `claude` invocation.
 *
 * The prompt is deliberately NOT part of argv. `-p`/`--print` is a boolean flag
 * in the CLI, so a prompt passed as a positional argument is parsed as an
 * *option* whenever it begins with "-" (verified against Claude Code 2.1.222:
 * `claude -p --some-flag` reports `error: unknown option '--some-flag'`).
 * Since prompts routinely come from untrusted input (see the /next route
 * handler), that would let a caller inject arbitrary CLI flags - including
 * `--bare`, which would silently break subscription-credential reading, and
 * `--dangerously-skip-permissions`. The prompt is written to the child's stdin
 * instead; see `startClaudeProcess`.
 */
export function buildClaudeArgs(
  options: ClaudeCodeOptions,
  resumeSessionId?: string
): string[] {
  const args: string[] = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
  ];

  if (resumeSessionId) {
    args.push('--resume', resumeSessionId);
  }

  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode);
  }

  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push('--allowedTools', options.allowedTools.join(','));
  }

  if (options.disallowedTools && options.disallowedTools.length > 0) {
    args.push('--disallowedTools', options.disallowedTools.join(','));
  }

  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }

  if (options.appendSystemPrompt) {
    args.push('--append-system-prompt', options.appendSystemPrompt);
  }

  if (options.mcpConfigPath) {
    args.push('--mcp-config', options.mcpConfigPath);
  }

  if (options.model) {
    args.push('--model', options.model);
  }

  // Deliberately never add --bare: non-bare mode is what lets the CLI read
  // local subscription credentials. See spec's Compliance & Scope Boundary.
  return args;
}
