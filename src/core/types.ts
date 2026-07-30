export interface TextDeltaEvent {
  type: 'text_delta';
  text: string;
}

export interface ToolUseEvent {
  type: 'tool_use';
  toolUseId: string;
  toolName: string;
  input: unknown;
}

export interface ToolResultEvent {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface ResultEvent {
  type: 'result';
  sessionId: string;
  costUsd: number;
  text: string;
}

export interface SessionInitEvent {
  type: 'session_init';
  sessionId: string;
}

export interface WarningEvent {
  type: 'warning';
  message: string;
  raw: string;
}

export type ClaudeEvent =
  | TextDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | ResultEvent
  | SessionInitEvent
  | WarningEvent;

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface ClaudeCodeOptions {
  /** Path to the claude binary. Defaults to "claude" (resolved via PATH). */
  binaryPath?: string;
  /** Working directory for the spawned process. */
  cwd?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  systemPrompt?: string;
  appendSystemPrompt?: string;
  mcpConfigPath?: string;
  model?: string;
}

export interface RunTaskResult {
  text: string;
  sessionId: string;
  costUsd: number;
  toolCalls: ToolUseEvent[];
}
