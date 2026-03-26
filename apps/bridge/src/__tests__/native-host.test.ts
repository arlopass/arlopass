import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import { NativeHost, NativeHostError } from "../native-host.js";

function encodeNativeFrame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

function decodeNativeFrames(data: Buffer): unknown[] {
  const messages: unknown[] = [];
  let offset = 0;
  while (offset + 4 <= data.length) {
    const len = data.readUInt32LE(offset);
    offset += 4;
    if (offset + len > data.length) {
      break;
    }
    messages.push(JSON.parse(data.subarray(offset, offset + len).toString("utf8")));
    offset += len;
  }
  return messages;
}

describe("NativeHost", () => {
  it("processes messages without running handler concurrently", async () => {
    const input = new PassThrough();
    const chunks: Buffer[] = [];
    const output = new Writable({
      write(chunk: Buffer, _enc, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    let inFlight = 0;
    let maxInFlight = 0;
    const host = new NativeHost({
      input,
      output,
      handler: async (message) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight -= 1;
        return {
          type: "echo",
          id: message["id"],
        };
      },
    });

    const runPromise = host.run();
    input.push(encodeNativeFrame({ id: "msg-1" }));
    input.push(encodeNativeFrame({ id: "msg-2" }));
    input.push(null);

    await runPromise;
    expect(maxInFlight).toBe(1);

    const responses = decodeNativeFrames(Buffer.concat(chunks)) as Array<
      Record<string, unknown>
    >;
    expect(responses).toEqual([
      { type: "echo", id: "msg-1" },
      { type: "echo", id: "msg-2" },
    ]);
  });

  it("rejects frames larger than configured maxFrameBytes", async () => {
    const input = new PassThrough();
    const output = new Writable({
      write(_chunk: Buffer, _enc, callback) {
        callback();
      },
    });

    const host = new NativeHost({
      input,
      output,
      handler: async () => ({ type: "noop" }),
      maxFrameBytes: 64,
    });

    const oversizedBody = Buffer.alloc(65, 0x61);
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32LE(oversizedBody.length, 0);

    const runPromise = host.run();
    input.push(Buffer.concat([header, oversizedBody]));
    input.push(null);

    await expect(runPromise).rejects.toBeInstanceOf(NativeHostError);
    await expect(runPromise).rejects.toThrow(/exceeds/i);
  });
});
