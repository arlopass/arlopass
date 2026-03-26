import { useCallback, useEffect, useReducer, useRef, useState } from "react";

/**
 * A useReducer wrapper that persists state to chrome.storage.session.
 * State is saved on every dispatch and restored on mount.
 * This allows wizard flows to survive popup close/reopen.
 */
export function usePersistedReducer<S, A>(
    key: string,
    reducer: (state: S, action: A) => S,
    initialState: S,
): [S, (action: A) => void, boolean] {
    const [restored, setRestored] = useState(false);
    const [state, rawDispatch] = useReducer(reducer, initialState);
    const stateRef = useRef(state);

    // Restore on mount
    useEffect(() => {
        try {
            chrome.storage.session.get([key], (result) => {
                const saved = result[key];
                if (saved != null && typeof saved === "object") {
                    // Hydrate by dispatching a special RESTORE action
                    // Since we can't inject into the reducer, we use a workaround:
                    // set state directly via a "hydrate" dispatch
                    rawDispatch({ type: "__HYDRATE__", state: saved } as unknown as A);
                }
                setRestored(true);
            });
        } catch {
            setRestored(true);
        }
    }, [key]);

    // Persist on every state change (after restore)
    useEffect(() => {
        if (!restored) return;
        stateRef.current = state;
        try {
            chrome.storage.session.set({ [key]: state });
        } catch { /* ignore */ }
    }, [key, state, restored]);

    const dispatch = useCallback((action: A) => {
        rawDispatch(action);
    }, []);

    return [state, dispatch, restored];
}
