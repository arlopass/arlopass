/**
 * Soak test: stream-soak
 *
 * Verifies long-running stream stability by running N iterations of a mock
 * streaming session and asserting:
 *   1. Chunk and completion counts match expectations for every iteration.
 *   2. Telemetry STREAM_CHUNK_TOTAL and STREAM_INTERRUPTION_TOTAL remain consistent.
 *   3. No unhandled errors or metric drift across iterations.
 *
 * All I/O is synchronous/mock — no timers or network.
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  TelemetryMetrics,
  TELEMETRY_METRIC_NAMES,
  type MetricPoint,
} from "@byom-ai/telemetry";

// ---------------------------------------------------------------------------
// Mock streaming pipeline
// ---------------------------------------------------------------------------

type StreamChunk = { type: "chunk"; delta: string; index: number };
type StreamDone = { type: "done" };
type StreamEvent = StreamChunk | StreamDone;

interface MockStream {
  events: readonly StreamEvent[];
}

function createMockStream(chunkCount: number): MockStream {
  const events: StreamEvent[] = [];
  for (let i = 0; i < chunkCount; i++) {
    events.push({ type: "chunk", delta: `chunk-${i}`, index: i });
  }
  events.push({ type: "done" });
  return { events };
}

function createInterruptedStream(failAt: number): MockStream {
  const events: StreamEvent[] = [];
  for (let i = 0; i < failAt; i++) {
    events.push({ type: "chunk", delta: `chunk-${i}`, index: i });
  }
  // No "done" event — stream ends abruptly (simulates connection drop)
  return { events };
}

// ---------------------------------------------------------------------------
// Streaming consumer with telemetry
// ---------------------------------------------------------------------------

type StreamResult = {
  chunksReceived: number;
  completed: boolean;
};

function consumeStream(
  stream: MockStream,
  options: {
    metrics: TelemetryMetrics;
    correlationId: string;
    providerId: string;
    origin: string;
    expectDone?: boolean;
  },
): StreamResult {
  const { metrics, correlationId, providerId, origin } = options;
  const meta = { correlationId, origin, providerId };

  let chunksReceived = 0;
  let completed = false;

  for (const event of stream.events) {
    if (event.type === "chunk") {
      chunksReceived += 1;
      metrics.emit({
        name: TELEMETRY_METRIC_NAMES.STREAM_CHUNK_TOTAL,
        value: 1,
        metadata: meta,
      });
    } else if (event.type === "done") {
      completed = true;
    }
  }

  if (!completed) {
    metrics.emit({
      name: TELEMETRY_METRIC_NAMES.STREAM_INTERRUPTION_TOTAL,
      value: 1,
      metadata: meta,
    });
  }

  return { chunksReceived, completed };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumMetric(points: readonly MetricPoint[], name: string): number {
  return points
    .filter((p) => p.name === name)
    .reduce((acc, p) => acc + p.value, 0);
}

function makeStreamMeta(iteration: number) {
  return {
    correlationId: `corr.soak.${iteration}`,
    providerId: "provider.soak",
    origin: "https://app.byom.local",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Soak: stream stability over many iterations", () => {
  let metrics: TelemetryMetrics;

  beforeEach(() => {
    metrics = new TelemetryMetrics();
  });

  it("processes 200 streams of 50 chunks each with zero interruptions", () => {
    const ITERATIONS = 200;
    const CHUNKS_PER_STREAM = 50;

    for (let i = 0; i < ITERATIONS; i++) {
      const stream = createMockStream(CHUNKS_PER_STREAM);
      const result = consumeStream(stream, {
        metrics,
        ...makeStreamMeta(i),
      });
      expect(result.chunksReceived).toBe(CHUNKS_PER_STREAM);
      expect(result.completed).toBe(true);
    }

    const recorded = metrics.getRecordedMetrics();
    expect(sumMetric(recorded, TELEMETRY_METRIC_NAMES.STREAM_CHUNK_TOTAL)).toBe(
      ITERATIONS * CHUNKS_PER_STREAM,
    );
    expect(
      sumMetric(recorded, TELEMETRY_METRIC_NAMES.STREAM_INTERRUPTION_TOTAL),
    ).toBe(0);
  });

  it("accurately counts interruptions in a mixed soak run", () => {
    const HEALTHY_STREAMS = 100;
    const INTERRUPTED_STREAMS = 20;
    const CHUNKS_PER_STREAM = 10;
    const INTERRUPT_AT = 5;

    for (let i = 0; i < HEALTHY_STREAMS; i++) {
      consumeStream(createMockStream(CHUNKS_PER_STREAM), {
        metrics,
        ...makeStreamMeta(i),
      });
    }
    for (let i = 0; i < INTERRUPTED_STREAMS; i++) {
      consumeStream(createInterruptedStream(INTERRUPT_AT), {
        metrics,
        ...makeStreamMeta(HEALTHY_STREAMS + i),
      });
    }

    const recorded = metrics.getRecordedMetrics();
    const expectedChunks =
      HEALTHY_STREAMS * CHUNKS_PER_STREAM + INTERRUPTED_STREAMS * INTERRUPT_AT;
    expect(sumMetric(recorded, TELEMETRY_METRIC_NAMES.STREAM_CHUNK_TOTAL)).toBe(
      expectedChunks,
    );
    expect(
      sumMetric(recorded, TELEMETRY_METRIC_NAMES.STREAM_INTERRUPTION_TOTAL),
    ).toBe(INTERRUPTED_STREAMS);
  });

  it("metric counts do not drift across batches (reset between runs)", () => {
    const BATCH_SIZE = 50;
    const CHUNKS = 5;

    for (let batch = 0; batch < 3; batch++) {
      metrics.reset();

      for (let i = 0; i < BATCH_SIZE; i++) {
        consumeStream(createMockStream(CHUNKS), {
          metrics,
          ...makeStreamMeta(i),
        });
      }

      const recorded = metrics.getRecordedMetrics();
      expect(
        sumMetric(recorded, TELEMETRY_METRIC_NAMES.STREAM_CHUNK_TOTAL),
      ).toBe(BATCH_SIZE * CHUNKS);
    }
  });

  it("handles zero-chunk streams (immediate done) without error", () => {
    const ITERATIONS = 100;

    for (let i = 0; i < ITERATIONS; i++) {
      const result = consumeStream(createMockStream(0), {
        metrics,
        ...makeStreamMeta(i),
      });
      expect(result.chunksReceived).toBe(0);
      expect(result.completed).toBe(true);
    }

    const recorded = metrics.getRecordedMetrics();
    expect(sumMetric(recorded, TELEMETRY_METRIC_NAMES.STREAM_CHUNK_TOTAL)).toBe(0);
    expect(
      sumMetric(recorded, TELEMETRY_METRIC_NAMES.STREAM_INTERRUPTION_TOTAL),
    ).toBe(0);
  });

  it("maintains correct chunk totals at high iteration count (1 000 streams)", () => {
    const ITERATIONS = 1_000;
    const CHUNKS = 3;

    for (let i = 0; i < ITERATIONS; i++) {
      consumeStream(createMockStream(CHUNKS), {
        metrics,
        ...makeStreamMeta(i),
      });
    }

    expect(
      sumMetric(
        metrics.getRecordedMetrics(),
        TELEMETRY_METRIC_NAMES.STREAM_CHUNK_TOTAL,
      ),
    ).toBe(ITERATIONS * CHUNKS);
  });
});
