# claude-code-bridge

A Node.js/Next.js wrapper around the [Claude Code CLI](https://code.claude.com), for personal-scale apps that want AI integration using your own Claude Code authentication instead of building CLI process management from scratch.

## Requirements

- **A persistent Node.js server or container.** This is a hard requirement, not a preference. The library spawns the `claude` binary as a child process and relies on credentials that were established once by running `claude login` on that machine. **Serverless and ephemeral runtimes (Vercel Functions, Lambda, Cloudflare Workers) are out of scope for v1**: there is no `claude` binary in the image and no persistent home directory to hold credentials. Long turns also outlive typical function timeouts.
- **Claude Code installed and on `PATH`** (or pass `binaryPath`), already authenticated — a subscription login or an `ANTHROPIC_API_KEY`.
- **Node.js 20 or newer.**

## How authentication works

This library implements no login flow of its own. It shells out to the `claude` binary and defers entirely to however Claude Code is already authenticated in that environment — a subscription login (`claude login`) or an `ANTHROPIC_API_KEY`.

**Scope boundary — read this before deploying:** subscription-based auth is licensed for individual use. This library is built for one developer's own personal-scale app(s), running on their own machine or server where they're already logged in. If your app has its own end users whose usage would route through your subscription, that's a different, prohibited pattern (see Anthropic's Consumer Terms) — configure an `ANTHROPIC_API_KEY` instead, which this library supports with no code changes. This reflects Anthropic's policy as of early 2026, which has tightened before; check Anthropic's current terms if you're unsure.

Also note: OAuth tokens on a persistent server expire roughly every 8-12 hours. When you see a `ClaudeAuthError`, re-run `claude login`.

## Install

```bash
npm install @dsdatsme/claude-code-bridge
```

## Background task usage

```typescript
import { runTask } from '@dsdatsme/claude-code-bridge';

const result = await runTask('Summarize this repository\'s README');
console.log(result.text, result.costUsd);
```

## Next.js chat usage

```typescript
// app/api/chat/route.ts
import { createClaudeRouteHandler, conversationIdFrom } from '@dsdatsme/claude-code-bridge/next';
import { ClaudeSession } from '@dsdatsme/claude-code-bridge';

// The library never persists a session-to-conversation mapping — that's your
// app's job. A Map is fine for one process; use your own store if you need more.
const sessions = new Map<string, ClaudeSession>();

export const POST = createClaudeRouteHandler((req) => {
  const conversationId = conversationIdFrom(req) ?? 'default';
  let session = sessions.get(conversationId);
  if (!session) {
    session = new ClaudeSession({
      // Scope what Claude may do on your server — see Security below.
      allowedTools: ['Read', 'Grep', 'Glob'],
      cwd: process.env.CLAUDE_WORKSPACE,
    });
    sessions.set(conversationId, session);
  }
  return session;
});
```

```tsx
// app/chat/page.tsx
'use client';
import { useClaudeChat } from '@dsdatsme/claude-code-bridge/next';

export default function ChatPage({ conversationId }: { conversationId: string }) {
  const { messages, isStreaming, error, sendMessage } = useClaudeChat({
    api: '/api/chat',
    // Sent as the x-conversation-id header, which the route handler above reads
    // to pick this conversation's session. Omit it and every client shares one.
    conversationId,
  });
  // render messages, show `error` if set, call sendMessage(text) on submit
}
```

`useClaudeChat` also accepts `headers` (e.g. an auth token for your chat route) and `body` (extra JSON fields merged alongside `prompt`).

If the client disconnects, the route handler kills the underlying `claude` process, so an abandoned turn doesn't keep running and spending tokens. You can also cancel a turn yourself: `ClaudeSession.send()` returns an async iterable that carries a `kill()` method.

## Security

**The prompt reaches a coding agent running on your server.** Whatever a client POSTs to the chat route is handed to `claude`, which can read and write files and run shell commands in its working directory. Treat the route as a privileged endpoint:

- **Scope the tools.** Set `allowedTools` / `disallowedTools` and a `permissionMode` appropriate to the task. `permissionMode: 'bypassPermissions'` disables permission checks entirely — never combine it with input you don't control.
- **Set `cwd`** to a directory you're willing to expose, not your whole repo or home directory.
- **Add your own authentication.** The example route above has none: anyone who can reach it can drive the agent. Put it behind your app's auth.
- **Expect to pay for every request.** Each turn spends real tokens or subscription quota; rate-limit the route.

The prompt is passed to the CLI over stdin rather than as a command-line argument, so prompt text cannot be interpreted as a CLI flag. The library never adds `--bare`, which is what allows the CLI to read local subscription credentials.

## Error handling

Turns fail in ordinary, recurring ways — an expired token is the common one — so errors are typed. A failure surfaces both by rejecting the turn's promise and by making the event iteration throw, and the SSE route handler forwards it to the browser as an `{ type: 'error', name, message }` event, which `useClaudeChat` exposes as `error`.

| Error | Meaning |
| --- | --- |
| `ClaudeNotFoundError` | The `claude` binary isn't on `PATH`. Install Claude Code, or pass `binaryPath`. |
| `ClaudeAuthError` | The CLI reported a credential problem. OAuth tokens expire roughly every 8-12 hours on a persistent server — re-run `claude login`. |
| `ClaudeResultError` | The turn completed but the CLI flagged it as failed (e.g. `error_max_turns`). Carries `sessionId`, `costUsd`, `text` and `subtype` — a failed turn still costs money and still belongs to a resumable session. |
| `ClaudeProcessError` | The process died, produced no result, or was cancelled. Carries `partialText`, whatever had streamed before the failure. |

```typescript
import { runTask, ClaudeAuthError } from '@dsdatsme/claude-code-bridge';

try {
  await runTask('...');
} catch (error) {
  if (error instanceof ClaudeAuthError) {
    // prompt the operator to re-run `claude login`
  }
}
```

## Checking the CLI is available

Useful at startup to fail loudly rather than on the first request:

```typescript
import { checkClaudeCode } from '@dsdatsme/claude-code-bridge';

const check = await checkClaudeCode();
// { installed: true, version: '2.1.222' } | { installed: false, warning: '...' }
if (!check.installed) console.warn(check.warning);
```

## Options

`ClaudeCodeOptions` is accepted by both `runTask` and the `ClaudeSession` constructor, and maps onto CLI flags:

| Option | Purpose |
| --- | --- |
| `binaryPath` | Path to the `claude` binary. Defaults to `claude` on `PATH`. |
| `cwd` | Working directory for the spawned process — the files Claude can reach. |
| `permissionMode` | `'default'`, `'acceptEdits'`, `'plan'` or `'bypassPermissions'`. |
| `allowedTools` / `disallowedTools` | Tool allow/deny lists, e.g. `['Read', 'Grep']`. |
| `systemPrompt` / `appendSystemPrompt` | Replace or extend the system prompt. |
| `mcpConfigPath` | Path to an MCP server config to pass through. |
| `model` | Model to use. |

`runTask` additionally accepts `onEvent` for progress visibility, and resolves to `{ text, sessionId, costUsd, toolCalls, isError }`.
