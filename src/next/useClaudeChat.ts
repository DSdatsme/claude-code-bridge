import { useCallback, useState } from 'react';
import type { ClaudeEvent } from '../core/types.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UseClaudeChatOptions {
  api: string;
}

export interface UseClaudeChatResult {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: Error | null;
  sendMessage: (text: string) => Promise<void>;
}

/**
 * An error reported by the server for a chat turn. `name` mirrors the
 * server-side error class (e.g. "ClaudeAuthError") so a UI can special-case it.
 */
export class ClaudeChatError extends Error {
  public readonly serverErrorName: string;

  constructor(message: string, serverErrorName: string) {
    super(message);
    this.name = 'ClaudeChatError';
    this.serverErrorName = serverErrorName;
  }
}

async function describeFailedResponse(response: Response): Promise<string> {
  let detail = '';
  try {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      detail = typeof parsed.error === 'string' ? parsed.error : text;
    } catch {
      detail = text;
    }
  } catch {
    // body unreadable; the status alone is still worth reporting
  }
  const suffix = detail.trim() ? `: ${detail.trim().slice(0, 500)}` : '';
  return `Chat request failed with HTTP ${response.status}${suffix}`;
}

export function useClaudeChat(options: UseClaudeChatOptions): UseClaudeChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      setError(null);
      setIsStreaming(true);
      setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);

      try {
        const response = await fetch(options.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });

        // A non-2xx response is a plain JSON or HTML error, not an SSE stream.
        // Parsing it as SSE would yield no events and leave the caller with a
        // blank assistant message and no error at all.
        if (!response.ok) {
          throw new Error(await describeFailedResponse(response));
        }

        if (!response.body) {
          throw new Error('Response had no readable body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';

          for (const chunk of chunks) {
            const line = chunk.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const event = JSON.parse(line.slice('data: '.length)) as ClaudeEvent;

            if (event.type === 'text_delta') {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                next[next.length - 1] = { ...last, content: last.content + event.text };
                return next;
              });
            } else if (event.type === 'error') {
              // The turn failed server-side (spawn failure, expired credentials,
              // mid-stream crash). Surface it instead of ending the stream
              // silently.
              throw new ClaudeChatError(event.message, event.name);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        // Don't leave an empty assistant bubble behind when nothing streamed.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [options.api]
  );

  return { messages, isStreaming, error, sendMessage };
}
