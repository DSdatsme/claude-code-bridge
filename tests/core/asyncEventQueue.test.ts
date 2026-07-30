import { describe, it, expect } from 'vitest';
import { AsyncEventQueue } from '../../src/core/asyncEventQueue.js';

describe('AsyncEventQueue', () => {
  it('yields values pushed before consumption starts', async () => {
    const queue = new AsyncEventQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.finish();

    const seen: number[] = [];
    for await (const value of queue) {
      seen.push(value);
    }
    expect(seen).toEqual([1, 2]);
  });

  it('yields values pushed after consumption has already started', async () => {
    const queue = new AsyncEventQueue<string>();
    const seen: string[] = [];

    const consume = (async () => {
      for await (const value of queue) {
        seen.push(value);
      }
    })();

    queue.push('a');
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.push('b');
    queue.finish();
    await consume;

    expect(seen).toEqual(['a', 'b']);
  });
});
