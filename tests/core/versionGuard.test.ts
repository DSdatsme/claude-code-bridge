import { describe, it, expect } from 'vitest';
import { checkClaudeCode } from '../../src/core/versionGuard.js';

describe('checkClaudeCode', () => {
  it('reports installed: true with the parsed version on success', async () => {
    const execFn = async () => ({ stdout: '2.4.1 (Claude Code)\n' });
    const result = await checkClaudeCode({ execFn });
    expect(result).toEqual({ installed: true, version: '2.4.1' });
  });

  it('reports installed: false with a warning when the command fails', async () => {
    const execFn = async () => {
      throw new Error('command not found: claude');
    };
    const result = await checkClaudeCode({ execFn });
    expect(result.installed).toBe(false);
    expect(result.warning).toMatch(/could not run/i);
  });

  it('warns but still reports installed: true when the version string is unparseable', async () => {
    const execFn = async () => ({ stdout: 'unexpected output' });
    const result = await checkClaudeCode({ execFn });
    expect(result.installed).toBe(true);
    expect(result.version).toBeUndefined();
    expect(result.warning).toMatch(/could not parse/i);
  });
});
