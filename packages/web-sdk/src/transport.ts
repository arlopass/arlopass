import { ArlopassTimeoutError } from "./errors.js";
import type {
  TransportRequest,
  TransportResponse,
  TransportStream,
} from "./types.js";

export interface ArlopassTransport {
  request<TRequestPayload, TResponsePayload>(
    request: TransportRequest<TRequestPayload>,
  ): Promise<TransportResponse<TResponsePayload>>;

  stream<TRequestPayload, TResponsePayload>(
    request: TransportRequest<TRequestPayload>,
  ): Promise<TransportStream<TResponsePayload>>;

  disconnect?(sessionId: string): Promise<void>;
}

type CancellationError = Error &
  Readonly<{
    reasonCode: "transport.cancelled";
    retryable: true;
  }>;

function createCancellationError(): CancellationError {
  return Object.assign(new Error("Operation cancelled."), {
    reasonCode: "transport.cancelled" as const,
    retryable: true as const,
  });
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted === true) {
    throw createCancellationError();
  }

  let timeoutHandle: NodeJS.Timeout | undefined;
  let abortHandler: (() => void) | undefined;
  const races: Promise<T>[] = [operation];

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    races.push(
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new ArlopassTimeoutError(timeoutMessage));
        }, timeoutMs);
      }),
    );
  }

  if (signal !== undefined) {
    races.push(
      new Promise<T>((_resolve, reject) => {
        abortHandler = () => {
          reject(createCancellationError());
        };
        signal.addEventListener("abort", abortHandler, { once: true });
      }),
    );
  }

  try {
    return await Promise.race(races);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
    if (abortHandler !== undefined && signal !== undefined) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

export async function* withStreamTimeout<T>(
  stream: TransportStream<T>,
  timeoutMs: number,
  timeoutMessage: string,
  signal?: AbortSignal,
): AsyncIterable<TransportResponse<T>> {
  const iterator = stream[Symbol.asyncIterator]();

  try {
    while (true) {
      const next = await withTimeout(iterator.next(), timeoutMs, timeoutMessage, signal);
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
