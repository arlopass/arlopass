import { useCallback, useState } from "react";
import { FeedbackMessage, type FeedbackData } from "./FeedbackMessage.js";

export type BridgePairingProps = {
  sendNativeMessage: (
    hostName: string,
    message: Record<string, unknown>,
  ) => Promise<{ ok: boolean; response?: unknown; errorMessage?: string }>;
};

export function BridgePairing({ sendNativeMessage }: BridgePairingProps) {
  const [hostName, setHostName] = useState("com.arlopass.bridge");
  const [pairingCode, setPairingCode] = useState("");
  const [pairings, setPairings] = useState<
    { handle: string; hostName: string }[]
  >([]);
  const [selectedHandle, setSelectedHandle] = useState("");
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshPairings = useCallback(async () => {
    try {
      const result = await sendNativeMessage(hostName, {
        type: "pairing.list",
      });
      if (result.ok && result.response != null) {
        const resp = result.response as Record<string, unknown>;
        const descriptors = Array.isArray(resp["pairings"])
          ? resp["pairings"]
          : [];
        const parsed = descriptors
          .filter(
            (d): d is Record<string, unknown> =>
              typeof d === "object" &&
              d !== null &&
              typeof (d as Record<string, unknown>)["handle"] === "string",
          )
          .map((d) => ({
            handle: d["handle"] as string,
            hostName:
              typeof d["hostName"] === "string"
                ? (d["hostName"] as string)
                : hostName,
          }));
        setPairings(parsed);
        if (parsed.length > 0 && !selectedHandle) {
          setSelectedHandle(parsed[0]!.handle);
        }
      }
    } catch {
      // Silent refresh failure
    }
  }, [hostName, selectedHandle, sendNativeMessage]);

  const handleBeginPairing = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendNativeMessage(hostName, {
        type: "pairing.begin",
      });
      if (result.ok) {
        setFeedback({
          kind: "success",
          title: "Pairing initiated",
          message:
            "If auto-pair is available, pairing completes automatically. Otherwise, enter the one-time code shown by the bridge.",
        });
        void refreshPairings();
      } else {
        setFeedback({
          kind: "error",
          title: "Pairing failed",
          message: result.errorMessage ?? "Unable to begin pairing.",
        });
      }
    } catch (err) {
      setFeedback({
        kind: "error",
        title: "Pairing error",
        message: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setBusy(false);
    }
  }, [hostName, refreshPairings, sendNativeMessage]);

  const handleCompletePairing = useCallback(async () => {
    if (pairingCode.trim().length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendNativeMessage(hostName, {
        type: "pairing.complete",
        code: pairingCode.trim(),
      });
      if (result.ok) {
        setFeedback({
          kind: "success",
          title: "Pairing complete",
          message: "Bridge pairing has been established.",
        });
        setPairingCode("");
        void refreshPairings();
      } else {
        setFeedback({
          kind: "error",
          title: "Pairing failed",
          message: result.errorMessage ?? "Invalid pairing code.",
        });
      }
    } catch (err) {
      setFeedback({
        kind: "error",
        title: "Error",
        message: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setBusy(false);
    }
  }, [hostName, pairingCode, refreshPairings, sendNativeMessage]);

  const handleRotate = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendNativeMessage(hostName, {
        type: "pairing.rotate",
      });
      if (result.ok) {
        setFeedback({
          kind: "success",
          title: "Keys rotated",
          message: "Pairing keys have been rotated.",
        });
        void refreshPairings();
      } else {
        setFeedback({
          kind: "error",
          title: "Rotation failed",
          message: result.errorMessage ?? "Unable to rotate keys.",
        });
      }
    } catch (err) {
      setFeedback({
        kind: "error",
        title: "Error",
        message: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setBusy(false);
    }
  }, [hostName, refreshPairings, sendNativeMessage]);

  const handleRevoke = useCallback(async () => {
    if (!selectedHandle) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await sendNativeMessage(hostName, {
        type: "pairing.revoke",
        handle: selectedHandle,
      });
      if (result.ok) {
        setFeedback({
          kind: "success",
          title: "Pairing revoked",
          message: `Handle ${selectedHandle} has been revoked.`,
        });
        setSelectedHandle("");
        void refreshPairings();
      } else {
        setFeedback({
          kind: "error",
          title: "Revocation failed",
          message: result.errorMessage ?? "Unable to revoke pairing.",
        });
      }
    } catch (err) {
      setFeedback({
        kind: "error",
        title: "Error",
        message: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setBusy(false);
    }
  }, [hostName, selectedHandle, refreshPairings, sendNativeMessage]);

  return (
    <div className="mt-4 pt-4 border-t border-[var(--ap-border)]">
      <h3 className="text-xs font-semibold text-[var(--ap-text-primary)] mb-3">
        Bridge Security
      </h3>

      {/* Host name */}
      <div className="flex flex-col gap-1 mb-3">
        <label
          htmlFor="bridge-host"
          className="text-[11px] font-semibold text-[var(--ap-text-body)]"
        >
          Bridge Host Name
        </label>
        <input
          id="bridge-host"
          type="text"
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          maxLength={120}
          placeholder="com.arlopass.bridge"
          className="w-full border border-[var(--ap-border)] rounded-md bg-[var(--ap-bg-base)] text-[var(--ap-text-primary)] text-xs py-2 px-2.5 placeholder:text-[var(--ap-text-tertiary)] transition-[border-color] duration-200 focus:outline-none focus:border-[var(--color-brand)]"
        />
        <p className="text-[9px] text-[var(--ap-text-tertiary)] m-0 leading-snug">
          Pairing and handshake keys are scoped to this native host.
        </p>
      </div>

      {/* Begin + Refresh */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={() => void handleBeginPairing()}
          disabled={busy}
          className="py-1.5 px-2.5 text-[10px]! font-semibold text-[var(--ap-text-primary)] bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] rounded-md cursor-pointer hover:border-[var(--ap-border-strong)] transition-all duration-200 active:scale-[0.97] disabled:opacity-40"
        >
          {busy ? "Pairing…" : "Pair Bridge"}
        </button>
        <button
          type="button"
          onClick={() => void refreshPairings()}
          disabled={busy}
          className="py-1.5 px-2.5 text-[10px]! font-semibold text-[var(--ap-text-primary)] bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] rounded-md cursor-pointer hover:border-[var(--ap-border-strong)] transition-all duration-200 active:scale-[0.97] disabled:opacity-40"
        >
          Refresh Pairings
        </button>
      </div>

      {/* Pairing code */}
      <div className="flex flex-col gap-1 mb-3">
        <label
          htmlFor="pairing-code"
          className="text-[11px] font-semibold text-[var(--ap-text-body)]"
        >
          One-time Pairing Code
        </label>
        <input
          id="pairing-code"
          type="password"
          value={pairingCode}
          onChange={(e) => setPairingCode(e.target.value)}
          maxLength={8}
          placeholder="Enter 8-character code"
          autoComplete="off"
          className="w-full border border-[var(--ap-border)] rounded-md bg-[var(--ap-bg-base)] text-[var(--ap-text-primary)] text-xs py-2 px-2.5 placeholder:text-[var(--ap-text-tertiary)] transition-[border-color] duration-200 focus:outline-none focus:border-[var(--color-brand)]"
        />
        <p className="text-[9px] text-[var(--ap-text-tertiary)] m-0 leading-snug">
          One-click pairing is automatic when available. If fallback is needed,
          enter the code shown by the bridge.
        </p>
      </div>

      {/* Complete + Rotate */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={() => void handleCompletePairing()}
          disabled={busy || pairingCode.trim().length === 0}
          className="py-1.5 px-2.5 text-[10px]! font-semibold text-[var(--ap-text-primary)] bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] rounded-md cursor-pointer hover:border-[var(--ap-border-strong)] transition-all duration-200 active:scale-[0.97] disabled:opacity-40"
        >
          Complete Pairing
        </button>
        <button
          type="button"
          onClick={() => void handleRotate()}
          disabled={busy}
          className="py-1.5 px-2.5 text-[10px]! font-semibold text-[var(--ap-text-primary)] bg-[var(--ap-bg-elevated)] border border-[var(--ap-border)] rounded-md cursor-pointer hover:border-[var(--ap-border-strong)] transition-all duration-200 active:scale-[0.97] disabled:opacity-40"
        >
          Rotate Pairing
        </button>
      </div>

      {/* Known pairings */}
      <div className="flex flex-col gap-1 mb-3">
        <label
          htmlFor="pairing-select"
          className="text-[11px] font-semibold text-[var(--ap-text-body)]"
        >
          Known Pairings
        </label>
        <select
          id="pairing-select"
          value={selectedHandle}
          onChange={(e) => setSelectedHandle(e.target.value)}
          className="w-full border border-[var(--ap-border)] rounded-md bg-[var(--ap-bg-base)] text-[var(--ap-text-primary)] text-xs py-2 px-2.5 transition-[border-color] duration-200 focus:outline-none focus:border-[var(--color-brand)]"
        >
          {pairings.length === 0 && <option value="">No pairings found</option>}
          {pairings.map((p) => (
            <option key={p.handle} value={p.handle}>
              {p.handle} ({p.hostName})
            </option>
          ))}
        </select>
        <p className="text-[9px] text-[var(--ap-text-tertiary)] m-0 leading-snug">
          Revoke a handle to immediately disable cloud handshake for that
          pairing.
        </p>
      </div>

      {/* Revoke */}
      <button
        type="button"
        onClick={() => void handleRevoke()}
        disabled={busy || !selectedHandle}
        className="py-1.5 px-2.5 text-[10px]! font-semibold text-[var(--color-danger)] bg-[var(--color-danger-subtle)] border border-[var(--color-danger)]/20 rounded-md cursor-pointer hover:bg-[var(--color-danger)] hover:text-[var(--ap-text-primary)] transition-all duration-200 active:scale-[0.97] disabled:opacity-40"
      >
        Revoke Pairing
      </button>

      <FeedbackMessage feedback={feedback} />
    </div>
  );
}
