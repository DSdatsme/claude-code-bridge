import { describe, it, expect } from 'vitest';
import { buildClaudeArgs } from '../../src/core/cliArgs.js';

describe('buildClaudeArgs', () => {
  it('builds the baseline stream-json invocation with no options', () => {
    const args = buildClaudeArgs({});
    expect(args).toEqual([
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
    ]);
  });

  it('never includes --bare', () => {
    const args = buildClaudeArgs({});
    expect(args).not.toContain('--bare');
  });

  it('never carries the prompt in argv, so prompt text cannot become a flag', () => {
    // The prompt is delivered over stdin instead; `-p` is a boolean flag, so a
    // positional prompt beginning with "-" would be parsed as an option.
    const args = buildClaudeArgs({});
    expect(args.filter((arg) => !arg.startsWith('-'))).toEqual(['stream-json']);
  });

  it('adds --resume when a session id is passed', () => {
    const args = buildClaudeArgs({}, 'sess_123');
    expect(args).toContain('--resume');
    expect(args[args.indexOf('--resume') + 1]).toBe('sess_123');
  });

  it('maps permission mode, tool lists, prompts, mcp config, and model', () => {
    const args = buildClaudeArgs({
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Edit'],
      disallowedTools: ['Bash'],
      systemPrompt: 'You are terse.',
      appendSystemPrompt: 'Always answer in English.',
      mcpConfigPath: './mcp.json',
      model: 'claude-opus-5',
    });

    expect(args).toEqual(
      expect.arrayContaining([
        '--permission-mode', 'acceptEdits',
        '--allowedTools', 'Read,Edit',
        '--disallowedTools', 'Bash',
        '--system-prompt', 'You are terse.',
        '--append-system-prompt', 'Always answer in English.',
        '--mcp-config', './mcp.json',
        '--model', 'claude-opus-5',
      ])
    );
  });
});
