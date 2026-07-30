export class ClaudeNotFoundError extends Error {
  constructor(binaryPath: string) {
    super(
      `Could not find the "${binaryPath}" executable on PATH. Install Claude Code ` +
      `(https://code.claude.com) and make sure "claude" is on your PATH, or pass ` +
      `{ binaryPath } pointing at it directly.`
    );
    this.name = 'ClaudeNotFoundError';
  }
}

export class ClaudeAuthError extends Error {
  constructor(stderr: string) {
    super(
      `Claude Code reported an authentication failure. If you're using a subscription ` +
      `login, it may have expired (OAuth tokens expire roughly every 8-12 hours on a ` +
      `persistent server) - run "claude login" again. Original stderr:\n${stderr}`
    );
    this.name = 'ClaudeAuthError';
  }
}

export class ClaudeProcessError extends Error {
  public readonly partialText: string;

  constructor(message: string, partialText: string) {
    super(message);
    this.name = 'ClaudeProcessError';
    this.partialText = partialText;
  }
}
