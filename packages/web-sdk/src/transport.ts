import { BYOMTimeoutError } from "./errors.js";
import type {
  TransportRequest,
  TransportResponse,
  TransportStream,
} from "./types.js";

export interface BYOMTransport {
  request<TRequestPayload, TResponsePayload>(
    request: TransportRequest<TRequestPayload>,
  ): Promise<TransportResponse<TResponsePayload>>;

  stream<TRequestPayload, TResponsePayload>(
    request: TransportRequest<TRequestPayload>,
  ): Promise<TransportStream<TResponsePayload>>;

  disconnect?(sessionId: string): Promise<void>;
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return operation;
  }

  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new BYOMTimeoutError(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function* withStreamTimeout<T>(
  stream: TransportStream<T>,
  timeoutMs: number,
  timeoutMessage: string,
): AsyncIterable<TransportResponse<T>> {
  const iterator = stream[Symbol.asyncIterator]();

  try {
    while (true) {
      const next = await withTimeout(iterator.next(), timeoutMs, timeoutMessage);
      if (next.done) {
        return;
      }

      yield next.value;
    }
  } finally {
    if (typeof iterator.return === "function") {
      await iterator.return();
    }
  }
}
