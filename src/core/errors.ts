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

/**
 * The CLI completed the turn but reported it as failed (`is_error: true`, or a
 * terminal subtype such as "error_max_turns" / "error_during_execution").
 * Whatever the CLI did report - text, cost, session id - is attached, since an
 * errored turn still costs money and still belongs to a resumable session.
 */
export class ClaudeResultError extends Error {
  public readonly sessionId: string;
  public readonly costUsd: number;
  public readonly text: string;
  public readonly subtype: string | undefined;

  constructor(details: {
    sessionId: string;
    costUsd: number;
    text: string;
    subtype?: string;
  }) {
    super(
      `Claude Code reported a failed turn` +
      `${details.subtype ? ` (subtype "${details.subtype}")` : ''}.` +
      `${details.text ? ` Reported output:\n${details.text}` : ''}`
    );
    this.name = 'ClaudeResultError';
    this.sessionId = details.sessionId;
    this.costUsd = details.costUsd;
    this.text = details.text;
    this.subtype = details.subtype;
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
