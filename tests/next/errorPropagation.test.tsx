// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ClaudeSession } from '../../src/core/session.js';
import type { SpawnFn } from '../../src/core/claudeProcess.js';
import { createClaudeRouteHandler } from '../../src/next/routeHandler.js';
import { useClaudeChat } from '../../src/next/useClaudeChat.js';
import { fakeChild } from '../fixtures/fakeChild.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Wires the real hook to the real route handler over a real ClaudeSession, so a
 * failure raised in the process layer has to travel the whole way to chat state.
 * Each layer was previously tested against a fake of its neighbour, which is
 * exactly how a silently-swallowed error survived.
 */
function mountChatAgainst(spawnFn: SpawnFn) {
  const session = new ClaudeSession({}, { spawnFn });
  const handler = createClaudeRouteHandler(() => session);

  vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
    handler(new Request('http://localhost/api/chat', init))
  );

  return renderHook(() => useClaudeChat({ api: '/api/chat' }));
}

describe('error propagation: core -> ClaudeSession -> SSE route handler -> useClaudeChat', () => {
  it('surfaces a missing claude binary as a populated error, not a silent empty stream', async () => {
    const { result } = mountChatAgainst(() => fakeChild({ emitErrorCode: 'ENOENT' }));

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toMatch(/Could not find/);
    expect(result.current.isStreaming).toBe(false);
    // The user's message stays; the empty assistant placeholder is cleaned up.
    expect(result.current.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('surfaces expired credentials as a ClaudeAuthError the UI can branch on', async () => {
    const { result } = mountChatAgainst(() =>
      fakeChild({ stderr: 'Error: not logged in, please run claude login' })
    );

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    expect(result.current.error?.message).toMatch(/authentication failure/);
    expect(result.current.error?.message).toMatch(/claude login/);
    expect((result.current.error as { serverErrorName?: string })?.serverErrorName).toBe(
      'ClaudeAuthError'
    );
  });

  it('keeps the text streamed before a mid-stream crash, and still reports the error', async () => {
    const { result } = mountChatAgainst(() =>
      fakeChild({
        lines: [
          '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"partial answer"}}}',
        ],
        stderr: 'segfault',
      })
    );

    await act(async () => {
      await result.current.sendMessage('hi');
    });

    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'partial answer' },
    ]);
    expect(result.current.error?.message).toMatch(/without a result/);
  });

  it('surfaces the route handler\'s own 400 instead of swallowing it', async () => {
    const handler = createClaudeRouteHandler(() => ({
      send: async function* () {
        // never reached
      },
    }));
    vi.stubGlobal('fetch', () =>
      handler(
        new Request('http://localhost/api/chat', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      )
    );

    const { result } = renderHook(() => useClaudeChat({ api: '/api/chat' }));
    await act(async () => {
      await result.current.sendMessage('hi');
    });

    expect(result.current.error?.message).toMatch(/HTTP 400/);
    expect(result.current.error?.message).toMatch(/must include a string "prompt"/);
    expect(result.current.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
