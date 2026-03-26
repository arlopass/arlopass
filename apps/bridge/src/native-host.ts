import type { Readable, Writable } from "node:stream";

export type NativeMessage = Readonly<Record<string, unknown>>;

export type NativeStreamWriter = (message: NativeMessage) => Promise<void>;

export type NativeMessageHandler = (
  message: NativeMessage,
  writer: NativeStreamWriter,
) => Promise<NativeMessage | undefined>;

const DEFAULT_MAX_FRAME_BYTES = 1_048_576;

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
}

export class NativeHostError extends Error {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = "NativeHostError";
  }
}

/**
 * Implements the Chrome native messaging wire protocol (length-prefixed JSON).
 *
 * Messages are framed as: [4-byte LE uint32 length][UTF-8 JSON body].
 * The host reads from `input` (process.stdin in production) and writes
 * responses to `output` (process.stdout in production).
 */
export class NativeHost {
  readonly #input: Readable;
  readonly #output: Writable;
  readonly #handler: NativeMessageHandler;
  readonly #maxFrameBytes: number;
  #buffer: Buffer = Buffer.alloc(0);
  #running = false;
  #drainQueue: Promise<void> = Promise.resolve();

  constructor(options: {
    input: Readable;
    output: Writable;
    handler: NativeMessageHandler;
    maxFrameBytes?: number;
  }) {
    this.#input = options.input;
    this.#output = options.output;
    this.#handler = options.handler;
    this.#maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    if (!Number.isSafeInteger(this.#maxFrameBytes) || this.#maxFrameBytes <= 0) {
      throw new NativeHostError(
        "NativeHost maxFrameBytes must be a positive safe integer.",
      );
    }
  }

  /**
   * Starts processing messages from the input stream.  Resolves when the
   * stream ends (browser disconnects or process exits).  Rejects on read
   * or parse errors.
   */
  run(): Promise<void> {
    if (this.#running) {
      return Promise.reject(new NativeHostError("NativeHost is already running."));
    }

    this.#running = true;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settleReject = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };
      const settleResolve = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };

      this.#input.on("data", (chunk: Buffer) => {
        this.#buffer = Buffer.concat([this.#buffer, chunk]);
        this.#drainQueue = this.#drainQueue.then(() => this.#drainBuffer());
        this.#drainQueue.catch((error) => {
          settleReject(toError(error));
        });
      });

      this.#input.once("end", () => {
        this.#drainQueue
          .then(() => {
            if (this.#buffer.length !== 0) {
              settleReject(
                new NativeHostError(
                  "Native message stream ended with an incomplete frame.",
                ),
              );
              return;
            }
            settleResolve();
          })
          .catch((error) => {
            settleReject(toError(error));
          });
      });

      this.#input.once("error", (error: Error) => settleReject(error));
    });
  }

  async #drainBuffer(): Promise<void> {
    while (this.#buffer.length >= 4) {
      const messageLength = this.#buffer.readUInt32LE(0);

      if (messageLength === 0) {
        // Zero-length frame signals clean shutdown.
        this.#buffer = Buffer.alloc(0);
        return;
      }

      if (messageLength > this.#maxFrameBytes) {
        throw new NativeHostError(
          `Native message frame length ${String(messageLength)} exceeds maxFrameBytes ${String(this.#maxFrameBytes)}.`,
        );
      }

      const totalNeeded = 4 + messageLength;
      if (this.#buffer.length < totalNeeded) {
        // Wait for more data.
        break;
      }

      const frame = this.#buffer.subarray(4, totalNeeded);
      this.#buffer = this.#buffer.subarray(totalNeeded);

      const message = this.#parseFrame(frame);
      const bridgeRequestId =
        typeof message["_bridgeRequestId"] === "string"
          ? message["_bridgeRequestId"]
          : undefined;
      const tagResponse = (msg: NativeMessage): NativeMessage =>
        bridgeRequestId !== undefined
          ? { ...msg, _bridgeRequestId: bridgeRequestId }
          : msg;
      const writer: NativeStreamWriter = (msg) =>
        this.#writeMessage(tagResponse(msg));
      const response = await this.#handler(message, writer);

      if (response !== undefined) {
        await this.#writeMessage(tagResponse(response));
      }
    }
  }

  #parseFrame(frame: Buffer): NativeMessage {
    let parsed: unknown;
    try {
      parsed = JSON.parse(frame.toString("utf8"));
    } catch (cause) {
      const opts: { cause?: Error } =
        cause instanceof Error ? { cause } : {};
      throw new NativeHostError(
        "Failed to parse native message as JSON.",
        opts,
      );
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new NativeHostError(
        "Native message must be a JSON object, not a primitive or array.",
      );
    }

    return parsed as NativeMessage;
  }

  async #writeMessage(message: NativeMessage): Promise<void> {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32LE(body.length, 0);
    const frame = Buffer.concat([header, body]);

    await new Promise<void>((resolve, reject) => {
      this.#output.write(frame, (error) => {
        if (error != null) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
