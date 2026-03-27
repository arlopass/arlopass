import { describe, expect, it } from "vitest";
import { convertStream } from "../convert-stream.js";

async function collectChunks(stream: ReadableStream<any>): Promise<any[]> {
  const reader = stream.getReader();
  const chunks: any[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

async function* yieldEvents(...events: any[]): AsyncIterable<any> {
  for (const e of events) yield e;
}

describe("convertStream", () => {
  it("emits start → text-start → text-delta(s) → text-end → finish for a normal stream", async () => {
    const source = yieldEvents(
      { type: "chunk", delta: "Hello", index: 0, correlationId: "c1" },
      { type: "chunk", delta: " world", index: 1, correlationId: "c1" },
      { type: "done", correlationId: "c1" },
    );

    const chunks = await collectChunks(convertStream(source));
    const types = chunks.map((c: any) => c.type);

    expect(types).toEqual([
      "start",
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "finish",
    ]);
    expect(chunks[2].delta).toBe("Hello");
    expect(chunks[3].delta).toBe(" world");
    expect(chunks[5].finishReason).toBe("stop");
  });

  it("uses the same id for text-start, text-delta, and text-end", async () => {
    const source = yieldEvents(
      { type: "chunk", delta: "Hi", index: 0, correlationId: "c1" },
      { type: "done", correlationId: "c1" },
    );

    const chunks = await collectChunks(convertStream(source));
    const textStart = chunks.find((c: any) => c.type === "text-start");
    const textDelta = chunks.find((c: any) => c.type === "text-delta");
    const textEnd = chunks.find((c: any) => c.type === "text-end");

    expect(textStart.id).toBeDefined();
    expect(textDelta.id).toBe(textStart.id);
    expect(textEnd.id).toBe(textStart.id);
  });

  it("emits error chunk when the source throws", async () => {
    async function* failing(): AsyncIterable<any> {
      yield { type: "chunk", delta: "partial", index: 0, correlationId: "c1" };
      throw new Error("connection lost");
    }

    const chunks = await collectChunks(convertStream(failing()));
    const errorChunk = chunks.find((c: any) => c.type === "error");

    expect(errorChunk).toBeDefined();
    expect(errorChunk.errorText).toBe("connection lost");
  });

  it("emits abort chunk when signal is aborted", async () => {
    const controller = new AbortController();

    async function* slow(): AsyncIterable<any> {
      yield { type: "chunk", delta: "Hi", index: 0, correlationId: "c1" };
      await new Promise((r) => setTimeout(r, 50));
      yield { type: "done", correlationId: "c1" };
    }

    setTimeout(() => controller.abort(), 10);

    const chunks = await collectChunks(convertStream(slow(), controller.signal));
    const types = chunks.map((c: any) => c.type);

    expect(types).toContain("abort");
  });

  it("handles empty stream (done immediately)", async () => {
    const source = yieldEvents(
      { type: "done", correlationId: "c1" },
    );

    const chunks = await collectChunks(convertStream(source));
    const types = chunks.map((c: any) => c.type);

    expect(types).toEqual(["start", "finish"]);
    expect(chunks[1].finishReason).toBe("stop");
  });
});
