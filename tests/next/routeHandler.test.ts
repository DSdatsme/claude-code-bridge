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

  it('strips warning.raw so raw CLI output never reaches the browser', async () => {
    async function* fakeEvents(): AsyncIterable<ClaudeEvent> {
      yield {
        type: 'warning',
        message: 'Unrecognized system message shape',
        raw: '{"secret":"contents of /etc/passwd surfaced by a tool"}',
      };
    }

    const handler = createClaudeRouteHandler(() => ({ send: () => fakeEvents() }));
    const response = await handler(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'hello' }),
      })
    );

    const body = await readAllChunks(response);
    expect(body).toContain('Unrecognized system message shape');
    expect(body).not.toContain('etc/passwd');
    expect(body).not.toContain('"raw"');
  });

  it('sends a typed error event when the event stream fails', async () => {
    async function* failingEvents(): AsyncIterable<ClaudeEvent> {
      yield { type: 'text_delta', text: 'partial' };
      throw Object.assign(new Error('credentials expired'), { name: 'ClaudeAuthError' });
    }

    const handler = createClaudeRouteHandler(() => ({ send: () => failingEvents() }));
    const response = await handler(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'hello' }),
      })
    );

    const body = await readAllChunks(response);
    expect(body).toContain(`data: ${JSON.stringify({ type: 'text_delta', text: 'partial' })}\n\n`);
    expect(body).toContain(
      `data: ${JSON.stringify({ type: 'error', name: 'ClaudeAuthError', message: 'credentials expired' })}\n\n`
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
