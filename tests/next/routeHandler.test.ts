import { describe, it, expect } from 'vitest';
import { createClaudeRouteHandler } from '../../src/next/routeHandler.js';
import type { ClaudeEvent } from '../../src/core/types.js';

async function readAllChunks(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe('createClaudeRouteHandler', () => {
  it('streams each session event as an SSE data line', async () => {
    async function* fakeEvents(): AsyncIterable<ClaudeEvent> {
      yield { type: 'text_delta', text: 'Hi' };
      yield { type: 'result', sessionId: 'sess_1', costUsd: 0.01, text: 'Hi' };
    }

    const handler = createClaudeRouteHandler(() => ({ send: () => fakeEvents() }));
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'hello' }),
    });

    const response = await handler(request);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    const body = await readAllChunks(response);
    expect(body).toContain(`data: ${JSON.stringify({ type: 'text_delta', text: 'Hi' })}\n\n`);
    expect(body).toContain(
      `data: ${JSON.stringify({ type: 'result', sessionId: 'sess_1', costUsd: 0.01, text: 'Hi' })}\n\n`
    );
  });

  it('returns a 400 response when the request body has no prompt', async () => {
    const handler = createClaudeRouteHandler(() => ({
      send: async function* () {},
    }));
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await handler(request);
    expect(response.status).toBe(400);
  });
});
