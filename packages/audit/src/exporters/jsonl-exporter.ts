import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { AuditEvent } from "../event-schema.js";

/** Options for the JSONL file exporter. */
export interface JsonlExporterOptions {
  /** Absolute or relative path to the output `.jsonl` file. */
  filePath: string;
  /**
   * Called before writing; return `false` to drop the event (e.g., for
   * sampling or secondary filtering).
   */
  filter?: (event: AuditEvent) => boolean;
}

/** Result returned by {@link JsonlExporter.export}. */
export interface JsonlExportResult {
  written: boolean;
  /** Set when `written` is false and a filter rejected the event. */
  filtered?: true;
  /** Set when the write failed. */
  error?: unknown;
}

/**
 * Exports {@link AuditEvent} records to a newline-delimited JSON (JSONL) file.
 *
 * Each line is a self-contained JSON object terminated by `\n`, compatible
 * with SIEM ingestion pipelines.
 */
export class JsonlExporter {
  private readonly filePath: string;
  private readonly filter: ((event: AuditEvent) => boolean) | undefined;

  constructor(options: JsonlExporterOptions) {
    this.filePath = options.filePath;
    this.filter = options.filter;
  }

  export(event: AuditEvent): JsonlExportResult {
    if (this.filter && !this.filter(event)) {
      return { written: false, filtered: true };
    }

    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      appendFileSync(this.filePath, JSON.stringify(event) + "\n", "utf8");
      return { written: true };
    } catch (error) {
      return { written: false, error };
    }
  }
}
