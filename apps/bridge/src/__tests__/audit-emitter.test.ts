/**
 * Tests for AuditEmitter.
 *
 * Coverage:
 *  - emit fires all registered exporters
 *  - emit is fire-and-forget for async exporters
 *  - emitAsync awaits all exporters and returns results
 *  - exporter failure does not propagate to caller (emit)
 *  - exporter failure does not propagate to caller (emitAsync)
 *  - onExportError callback receives errors
 *  - missing required audit fields throw AuditSchemaError before export
 *  - metadata is passed through to the event
 */
import { describe, expect, it, vi } from "vitest";

import { AuditSchemaError } from "@byom-ai/audit";

import { AuditEmitter, type AuditExporter } from "../audit/audit-emitter.js";
import type { AuditEvent, AuditEventFields } from "../audit/audit-emitter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validFields(overrides: Partial<AuditEventFields> = {}): AuditEventFields {
  return {
    timestamp: "2026-03-23T10:00:00.000Z",
    origin: "https://app.example.com",
    providerId: "provider.ollama",
    modelId: "model.llama3",
    capability: "chat.stream",
    decision: "allow",
    reasonCode: "allow",
    correlationId: "cor.audit.001",
    policyVersion: "2026.03.23",
    ...overrides,
  };
}

function captureExporter(): {
  exporter: AuditExporter;
  received: AuditEvent[];
} {
  const received: AuditEvent[] = [];
  const exporter: AuditExporter = {
    export: vi.fn().mockImplementation((event: AuditEvent) => {
      received.push(event);
    }),
  };
  return { exporter, received };
}

// ---------------------------------------------------------------------------
// Synchronous emit
// ---------------------------------------------------------------------------

describe("AuditEmitter.emit", () => {
  it("calls all registered exporters with the event", () => {
    const { exporter: exp1, received: r1 } = captureExporter();
    const { exporter: exp2, received: r2 } = captureExporter();
    const emitter = new AuditEmitter();
    emitter.addExporter(exp1);
    emitter.addExporter(exp2);

    emitter.emit(validFields());

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });

  it("does not throw when an exporter throws synchronously", () => {
    const faultyExporter: AuditExporter = {
      export: vi.fn().mockImplementation(() => {
        throw new Error("disk error");
      }),
    };
    const emitter = new AuditEmitter();
    emitter.addExporter(faultyExporter);

    expect(() => emitter.emit(validFields())).not.toThrow();
  });

  it("calls onExportError when a synchronous exporter throws", () => {
    const onExportError = vi.fn();
    const emitter = new AuditEmitter({ onExportError });
    emitter.addExporter({
      export: () => {
        throw new Error("boom");
      },
    });

    emitter.emit(validFields());

    expect(onExportError).toHaveBeenCalledOnce();
    expect(onExportError.mock.calls[0]![1]).toBe(0);
  });

  it("passes metadata through to the event", () => {
    const { exporter, received } = captureExporter();
    const emitter = new AuditEmitter();
    emitter.addExporter(exporter);

    emitter.emit({ ...validFields(), metadata: { requestSize: 512 } });

    expect(received[0]!.metadata).toMatchObject({ requestSize: 512 });
  });

  it("works with zero exporters registered", () => {
    const emitter = new AuditEmitter();
    expect(() => emitter.emit(validFields())).not.toThrow();
  });

  it("throws AuditSchemaError when required fields are missing", () => {
    const emitter = new AuditEmitter();
    const incomplete = { ...validFields(), correlationId: "" } as AuditEventFields;
    expect(() => emitter.emit(incomplete)).toThrow(AuditSchemaError);
  });
});

// ---------------------------------------------------------------------------
// Async emitAsync
// ---------------------------------------------------------------------------

describe("AuditEmitter.emitAsync", () => {
  it("returns success results for all exporters", async () => {
    const { exporter: exp1 } = captureExporter();
    const { exporter: exp2 } = captureExporter();
    const emitter = new AuditEmitter();
    emitter.addExporter(exp1);
    emitter.addExporter(exp2);

    const results = await emitter.emitAsync(validFields());

    expect(results).toHaveLength(2);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
  });

  it("returns failure result when an exporter throws", async () => {
    const emitter = new AuditEmitter();
    emitter.addExporter({
      export: () => {
        throw new Error("fail");
      },
    });

    const results = await emitter.emitAsync(validFields());

    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toBeInstanceOf(Error);
  });

  it("does not reject the Promise on exporter failure", async () => {
    const emitter = new AuditEmitter();
    emitter.addExporter({
      export: async () => {
        throw new Error("async fail");
      },
    });

    await expect(emitter.emitAsync(validFields())).resolves.toBeDefined();
  });

  it("awaits async exporters before returning", async () => {
    const order: string[] = [];
    const asyncExporter: AuditExporter = {
      export: async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        order.push("exporter");
      },
    };
    const emitter = new AuditEmitter();
    emitter.addExporter(asyncExporter);

    await emitter.emitAsync(validFields());
    order.push("after");

    expect(order).toEqual(["exporter", "after"]);
  });

  it("calls onExportError when async exporter throws", async () => {
    const onExportError = vi.fn();
    const emitter = new AuditEmitter({ onExportError });
    emitter.addExporter({
      export: async () => {
        throw new Error("async error");
      },
    });

    await emitter.emitAsync(validFields());

    expect(onExportError).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// exporterCount
// ---------------------------------------------------------------------------

describe("AuditEmitter.exporterCount", () => {
  it("reflects the number of registered exporters", () => {
    const emitter = new AuditEmitter();
    expect(emitter.exporterCount).toBe(0);

    emitter.addExporter({ export: vi.fn() });
    expect(emitter.exporterCount).toBe(1);

    emitter.addExporter({ export: vi.fn() });
    expect(emitter.exporterCount).toBe(2);
  });
});
