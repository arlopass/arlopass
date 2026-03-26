import type { BYOMTransport } from "@byom-ai/web-sdk";

declare global {
  interface Window {
    byom?: BYOMTransport;
  }
}

export {};
