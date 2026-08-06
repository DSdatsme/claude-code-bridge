# claude-code-bridge

A Node.js/Next.js wrapper around the [Claude Code CLI](https://code.claude.com), for personal-scale apps that want AI integration using your own Claude Code authentication instead of building CLI process management from scratch.

## How authentication works

This library implements no login flow of its own. It shells out to the `claude` binary and defers entirely to however Claude Code is already authenticated in that environment — a subscription login (`claude login`) or an `ANTHROPIC_API_KEY`.

**Scope boundary — read this before deploying:** subscription-based auth is licensed for individual use. This library is built for one developer's own personal-scale app(s), running on their own machine or server where they're already logged in. If your app has its own end users whose usage would route through your subscription, that's a different, prohibited pattern (see Anthropic's Consumer Terms) — configure an `ANTHROPIC_API_KEY` instead, which this library supports with no code changes. This reflects Anthropic's policy as of early 2026, which has tightened before; check Anthropic's current terms if you're unsure.

Also note: OAuth tokens on a persistent server expire roughly every 8-12 hours. When you see a `ClaudeAuthError`, re-run `claude login`.

## Install

```bash
npm install claude-code-bridge
```

## Background task usage

```typescript
import { runTask } from 'claude-code-bridge';

const result = await runTask('Summarize this repository\'s README');
console.log(result.text, result.costUsd);
```

## Next.js chat usage

```typescript
// app/api/chat/route.ts
import { createClaudeRouteHandler, conversationIdFrom } from 'claude-code-bridge/next';
import { ClaudeSession } from 'claude-code-bridge';

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
import { useClaudeChat } from 'claude-code-bridge/next';

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
