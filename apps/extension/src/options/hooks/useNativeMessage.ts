import { useCallback } from "react";

const NATIVE_MESSAGE_TIMEOUT_MS = 15_000;

export type NativeMessageResult =
  | { ok: true; response: unknown }
  | { ok: false; errorMessage: string };

export function useNativeMessage() {
  const sendNativeMessage = useCallback(
    async (
      hostName: string,
      message: Record<string, unknown>,
      options?: { timeoutMs?: number },
    ): Promise<NativeMessageResult> => {
      const timeoutMs = options?.timeoutMs ?? NATIVE_MESSAGE_TIMEOUT_MS;

      return new Promise<NativeMessageResult>((resolve) => {
        const timer = setTimeout(() => {
          resolve({
            ok: false,
            errorMessage: `Native message to ${hostName} timed out after ${timeoutMs}ms.`,
          });
        }, timeoutMs);

        try {
          chrome.runtime.sendNativeMessage(hostName, message, (response: unknown) => {
            clearTimeout(timer);
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError !== undefined) {
              resolve({
                ok: false,
                errorMessage: runtimeError.message ?? "Native messaging failed.",
              });
              return;
            }
            resolve({ ok: true, response });
          });
        } catch (err) {
          clearTimeout(timer);
          resolve({
            ok: false,
            errorMessage: err instanceof Error ? err.message : "Native messaging unavailable.",
          });
        }
      });
    },
    [],
  );

  return { sendNativeMessage };
}
