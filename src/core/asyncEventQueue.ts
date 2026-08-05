interface Waiter<T> {
  resolve: (result: IteratorResult<T>) => void;
  reject: (error: Error) => void;
}

export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private buffered: T[] = [];
  private waiting: Array<Waiter<T>> = [];
  private finished = false;
  private failure: Error | undefined;

  push(value: T): void {
    if (this.finished) return;
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
    } else {
      this.buffered.push(value);
    }
  }

  /** Ends the stream normally: consumers see the iteration complete. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    while (this.waiting.length > 0) {
      this.waiting.shift()?.resolve({ value: undefined as unknown as T, done: true });
    }
  }

  /**
   * Ends the stream with an error: consumers see `for await` throw, rather than
   * the iteration quietly completing. Any events already buffered are still
   * delivered first, so a partial turn is not lost on the way to the error.
   */
  fail(error: Error): void {
    if (this.finished) return;
    this.finished = true;
    this.failure = error;
    while (this.waiting.length > 0) {
      this.waiting.shift()?.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffered.length > 0) {
          return Promise.resolve({ value: this.buffered.shift() as T, done: false });
        }
        if (this.failure) {
          return Promise.reject(this.failure);
        }
        if (this.finished) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise((resolve, reject) => {
          this.waiting.push({ resolve, reject });
        });
      },
    };
  }
}
