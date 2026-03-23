import type { Readable, Writable } from "node:stream";

export type NativeMessage = Readonly<Record<string, unknown>>;

export type NativeMessageHandler = (
  message: NativeMessage,
) => Promise<NativeMessage | undefined>;

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
  #buffer: Buffer = Buffer.alloc(0);
  #running = false;

  constructor(options: {
    input: Readable;
    output: Writable;
    handler: NativeMessageHandler;
  }) {
    this.#input = options.input;
    this.#output = options.output;
    this.#handler = options.handler;
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
      this.#input.on("data", (chunk: Buffer) => {
        this.#buffer = Buffer.concat([this.#buffer, chunk]);
        this.#drainBuffer().catch(reject);
      });

      this.#input.once("end", () => resolve());
      this.#input.once("error", (error: Error) => reject(error));
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

      const totalNeeded = 4 + messageLength;
      if (this.#buffer.length < totalNeeded) {
        // Wait for more data.
        break;
      }

      const frame = this.#buffer.subarray(4, totalNeeded);
      this.#buffer = this.#buffer.subarray(totalNeeded);

      const message = this.#parseFrame(frame);
      const response = await this.#handler(message);

      if (response !== undefined) {
        await this.#writeMessage(response);
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
