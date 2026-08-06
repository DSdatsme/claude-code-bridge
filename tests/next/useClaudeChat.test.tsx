// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useClaudeChat } from '../../src/next/useClaudeChat.js';

function sseResponse(events: object[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useClaudeChat', () => {
  it('accumulates text deltas into a streaming assistant message, then finalizes on result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { type: 'text_delta', text: 'Hel' },
          { type: 'text_delta', text: 'lo' },
          { type: 'result', sessionId: 'sess_1', costUsd: 0.01, text: 'Hello' },
        ])
      )
    );

    const { result } = renderHook(() => useClaudeChat({ api: '/api/chat' }));

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello' },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('sends the conversation id, extra headers and extra body fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useClaudeChat({
        api: '/api/chat',
        conversationId: 'conv_42',
        headers: { Authorization: 'Bearer token' },
        body: { projectId: 'proj_1' },
      })
    );

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chat');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      // The route handler reads this to pick the right ClaudeSession; without it
      // every client shares one conversation on the server.
      'x-conversation-id': 'conv_42',
      Authorization: 'Bearer token',
    });
    expect(JSON.parse(init.body)).toEqual({ prompt: 'hi', projectId: 'proj_1' });
  });

  it('omits the conversation header when no conversationId is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useClaudeChat({ api: '/api/chat' }));
    await act(async () => {
      await result.current.sendMessage('hi');
    });

    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('x-conversation-id');
  });

  it('surfaces a fetch failure as `error` without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { result } = renderHook(() => useClaudeChat({ api: '/api/chat' }));

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    expect(result.current.error?.message).toBe('network down');
    expect(result.current.isStreaming).toBe(false);
  });
});
