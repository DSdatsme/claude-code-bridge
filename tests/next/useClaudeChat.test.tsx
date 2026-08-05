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
