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
import { createClaudeRouteHandler } from 'claude-code-bridge/next';
import { ClaudeSession } from 'claude-code-bridge';

const sessions = new Map<string, ClaudeSession>();

export const POST = createClaudeRouteHandler((req) => {
  const conversationId = req.headers.get('x-conversation-id') ?? 'default';
  if (!sessions.has(conversationId)) {
    sessions.set(conversationId, new ClaudeSession());
  }
  return sessions.get(conversationId)!;
});
```

```tsx
// app/chat/page.tsx
'use client';
import { useClaudeChat } from 'claude-code-bridge/next';

export default function ChatPage() {
  const { messages, isStreaming, sendMessage } = useClaudeChat({ api: '/api/chat' });
  // render messages, call sendMessage(text) on submit
}
```
