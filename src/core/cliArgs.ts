import type { ClaudeCodeOptions } from './types.js';

export function buildClaudeArgs(
  prompt: string,
  options: ClaudeCodeOptions,
  resumeSessionId?: string
): string[] {
  const args: string[] = [
    '-p', prompt,
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
