"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationManager } from "@arlopass/web-sdk";
import type { ArlopassSDKError } from "@arlopass/web-sdk";
import type {
    ChatMessage,
    ChatSubscribe,
    ContextWindowInfo,
    MessageId,
    ToolActivityState,
    ToolDefinition,
    TrackedChatMessage,
} from "../types.js";
import { TOOL_ACTIVITY_IDLE } from "../types.js";
import { Subscriptions } from "../store/subscriptions.js";
import { useArlopassContext, useStoreSnapshot } from "./use-store.js";

function generateMessageId(): MessageId {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

type UseConversationOptions = {
    initialMessages?: TrackedChatMessage[];
    systemPrompt?: string;
    tools?: ToolDefinition[];
    maxTokens?: number;
    maxToolRounds?: number;
    primeTools?: boolean;
    hideToolCalls?: boolean;
};

type UseConversationReturn = Readonly<{
    messages: readonly TrackedChatMessage[];
    streamingContent: string;
    streamingMessageId: MessageId | null;
    isStreaming: boolean;
    isSending: boolean;
    error: ArlopassSDKError | null;
    tokenCount: number;
    contextWindow: readonly ChatMessage[];
    contextInfo: ContextWindowInfo;
    /** Current tool activity — priming, executing, result, or idle. */
    toolActivity: ToolActivityState;
    send: (content: string, options?: { pinned?: boolean }) => Promise<MessageId>;
    stream: (content: string, options?: { pinned?: boolean }) => Promise<MessageId>;
    stop: () => void;
    clearMessages: () => void;
    pinMessage: (messageId: MessageId, pinned: boolean) => void;
    submitToolResult: (toolCallId: string, result: string) => void;
    retry: (() => Promise<void>) | null;
    subscribe: ChatSubscribe;
}>;

export function useConversation(options?: UseConversationOptions): UseConversationReturn {
    const { store } = useArlopassContext();
    const snapshot = useStoreSnapshot();
    const [messages, setMessages] = useState<TrackedChatMessage[]>(
        () => options?.initialMessages ?? [],
    );
    const [streamingContent, setStreamingContent] = useState("");
    const [streamingMessageId, setStreamingMessageId] = useState<MessageId | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<ArlopassSDKError | null>(null);
    const [tokenCount, setTokenCount] = useState(0);
    const [contextWindow, setContextWindow] = useState<readonly ChatMessage[]>([]);
    const [stateContextInfo, setStateContextInfo] = useState<ContextWindowInfo>({
        maxTokens: 0, usedTokens: 0, reservedOutputTokens: 0, remainingTokens: 0, usageRatio: 0,
    });
    const [toolActivity, setToolActivity] = useState<ToolActivityState>(TOOL_ACTIVITY_IDLE);

    const messagesRef = useRef<TrackedChatMessage[]>(options?.initialMessages ?? []);
    const abortRef = useRef<AbortController | null>(null);
    const busyRef = useRef(false);
    const lastRequestRef = useRef<{ type: "send" | "stream"; content: string; pinned?: boolean } | null>(null);
    const subsRef = useRef(new Subscriptions());
    const usedToolsRef = useRef<string[]>([]);

    const managerRef = useRef<ConversationManager | null>(null);
    if (managerRef.current === null) {
        const managerOpts: ConstructorParameters<typeof ConversationManager>[0] = {
            client: store.client,
        };
        if (options?.systemPrompt !== undefined) managerOpts.systemPrompt = options.systemPrompt;
        if (options?.tools !== undefined) managerOpts.tools = options.tools;
        if (options?.maxTokens !== undefined) managerOpts.maxTokens = options.maxTokens;
        if (options?.maxToolRounds !== undefined) managerOpts.maxToolRounds = options.maxToolRounds;
        if (options?.primeTools !== undefined) managerOpts.primeTools = options.primeTools;
        if (options?.hideToolCalls !== undefined) managerOpts.hideToolCalls = options.hideToolCalls;
        managerRef.current = new ConversationManager(managerOpts);
    }

    const optionsRef = useRef(options);
    optionsRef.current = options;

    // Track provider/model by value (not object reference) to avoid
    // recreating the ConversationManager on every heartbeat snapshot.
    const selectedProviderKey = snapshot.selectedProvider !== null
        ? `${snapshot.selectedProvider.providerId}::${snapshot.selectedProvider.modelId}`
        : null;
    const isConnected = snapshot.state === "connected" || snapshot.state === "degraded";
    const prevProviderKeyRef = useRef<string | null>(null);

    // Derive context info reactively: prefer the state-tracked value (which
    // includes token usage from messages), but fall back to the manager's
    // live value when the model changes. This ensures the context window
    // size is correct as soon as a provider is selected, without waiting
    // for an effect cycle.
    const contextInfo = useMemo<ContextWindowInfo>(() => {
        if (managerRef.current === null) return stateContextInfo;
        const live = managerRef.current.getContextInfo();
        // If the state version has a valid maxTokens, use it (it includes
        // up-to-date token usage). Otherwise fall back to the live value
        // which resolves maxTokens dynamically from the current model.
        if (stateContextInfo.maxTokens > 0) return stateContextInfo;
        return live;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stateContextInfo, selectedProviderKey]);

    // Recreate the ConversationManager when the selected provider/model changes
    // so maxTokens reflects the new model's context window.
    // NEVER recreate while a stream is in progress — it would orphan the stream.
    useEffect(() => {
        if (selectedProviderKey === null) return;
        if (selectedProviderKey === prevProviderKeyRef.current) return;
        if (busyRef.current) return; // don't replace manager mid-stream

        // Only recreate on subsequent changes, not the initial selection.
        // The inline creation above already handles the initial state.
        // Context info updates on every change because ConversationManager
        // resolves maxTokens dynamically from the client's selected model.
        if (prevProviderKeyRef.current !== null) {
            const opts = optionsRef.current;
            const managerOpts: ConstructorParameters<typeof ConversationManager>[0] = {
                client: store.client,
            };
            if (opts?.systemPrompt !== undefined) managerOpts.systemPrompt = opts.systemPrompt;
            if (opts?.tools !== undefined) managerOpts.tools = opts.tools;
            if (opts?.maxTokens !== undefined) managerOpts.maxTokens = opts.maxTokens;
            if (opts?.maxToolRounds !== undefined) managerOpts.maxToolRounds = opts.maxToolRounds;
            if (opts?.primeTools !== undefined) managerOpts.primeTools = opts.primeTools;
            if (opts?.hideToolCalls !== undefined) managerOpts.hideToolCalls = opts.hideToolCalls;
            managerRef.current = new ConversationManager(managerOpts);
        }

        prevProviderKeyRef.current = selectedProviderKey;

        // Always refresh context info when provider changes
        if (managerRef.current !== null) {
            setStateContextInfo(managerRef.current.getContextInfo());
            setTokenCount(managerRef.current.getTokenCount());
            setContextWindow(managerRef.current.getContextWindow());
        }
    }, [selectedProviderKey, store]);

    // Refresh context info when connection is established and a provider is
    // selected. This handles the initial load case where the manager was
    // created before the extension connected and resolved the model's
    // context window size.
    useEffect(() => {
        if (!isConnected || selectedProviderKey === null) return;
        if (managerRef.current === null) return;
        const info = managerRef.current.getContextInfo();
        // Only update if the value actually changed (avoids render loops)
        if (info.maxTokens > 0) {
            setStateContextInfo(info);
            setTokenCount(managerRef.current.getTokenCount());
            setContextWindow(managerRef.current.getContextWindow());
        }
    }, [isConnected, selectedProviderKey]);

    const appendMessage = useCallback((msg: TrackedChatMessage) => {
        messagesRef.current = [...messagesRef.current, msg];
        setMessages(messagesRef.current);
        return msg;
    }, []);

    const updateMessage = useCallback((id: MessageId, patch: Partial<TrackedChatMessage>) => {
        messagesRef.current = messagesRef.current.map((m) =>
            m.id === id ? { ...m, ...patch } : m,
        );
        setMessages(messagesRef.current);
    }, []);

    const refreshTokenState = useCallback(() => {
        const manager = managerRef.current!;
        setTokenCount(manager.getTokenCount());
        setContextWindow(manager.getContextWindow());
        setStateContextInfo(manager.getContextInfo());
    }, []);

    const send = useCallback(async (content: string, opts?: { pinned?: boolean }): Promise<MessageId> => {
        if (busyRef.current) {
            throw new Error("A chat operation is already in progress. Wait for it to complete or call stop().");
        }
        busyRef.current = true;
        lastRequestRef.current = opts?.pinned !== undefined
            ? { type: "send", content, pinned: opts.pinned }
            : { type: "send", content };
        setError(null);
        setIsSending(true);

        const userMsgId = generateMessageId();
        const userMsg: TrackedChatMessage = {
            id: userMsgId,
            role: "user",
            content,
            status: "complete",
            pinned: opts?.pinned ?? false,
        };
        appendMessage(userMsg);

        try {
            const result = await managerRef.current!.send(content, opts?.pinned !== undefined ? { pinned: opts.pinned } : undefined);

            const assistantMsgId = generateMessageId();
            const assistantMsg: TrackedChatMessage = {
                id: assistantMsgId,
                role: "assistant",
                content: result.content,
                inResponseTo: userMsgId,
                status: "complete",
                pinned: false,
            };
            appendMessage(assistantMsg);
            refreshTokenState();
            subsRef.current.notify();
            return userMsgId;
        } catch (err) {
            setError(err as ArlopassSDKError);
            updateMessage(userMsgId, { status: "error" });
            throw err;
        } finally {
            busyRef.current = false;
            setIsSending(false);
        }
    }, [store, appendMessage, updateMessage, refreshTokenState]);

    const stream = useCallback(async (content: string, opts?: { pinned?: boolean }): Promise<MessageId> => {
        if (busyRef.current) {
            throw new Error("A chat operation is already in progress. Wait for it to complete or call stop().");
        }
        busyRef.current = true;
        lastRequestRef.current = opts?.pinned !== undefined
            ? { type: "stream", content, pinned: opts.pinned }
            : { type: "stream", content };
        setError(null);
        setIsStreaming(true);
        setToolActivity(TOOL_ACTIVITY_IDLE);
        usedToolsRef.current = [];

        const userMsgId = generateMessageId();
        const userMsg: TrackedChatMessage = {
            id: userMsgId,
            role: "user",
            content,
            status: "complete",
            pinned: opts?.pinned ?? false,
        };
        appendMessage(userMsg);

        const assistantMsgId = generateMessageId();
        setStreamingMessageId(assistantMsgId);
        setStreamingContent("");

        const controller = new AbortController();
        abortRef.current = controller;

        let accumulated = "";

        try {
            const iterable = managerRef.current!.stream(content, opts?.pinned !== undefined ? { pinned: opts.pinned } : undefined);

            for await (const event of iterable) {
                if (controller.signal.aborted) break;

                if (event.type === "chunk") {
                    accumulated += event.delta;
                    const current = accumulated;
                    if (typeof requestAnimationFrame === "function") {
                        requestAnimationFrame(() => {
                            setStreamingContent(current);
                        });
                    } else {
                        setTimeout(() => {
                            setStreamingContent(current);
                        }, 0);
                    }
                } else if (event.type === "tool_call") {
                    // New tool round — reset streaming content (old text was tool markup)
                    accumulated = "";
                    setStreamingContent("");
                    if (!usedToolsRef.current.includes(event.name)) {
                        usedToolsRef.current.push(event.name);
                    }
                    setToolActivity({ phase: "executing", name: event.name, arguments: event.arguments });
                    subsRef.current.notify();
                } else if (event.type === "tool_result") {
                    setToolActivity({ phase: "result", name: event.name });
                    subsRef.current.notify();
                } else if (event.type === "tool_priming_start") {
                    setToolActivity({ phase: "priming" });
                    subsRef.current.notify();
                } else if (event.type === "tool_priming_match") {
                    setToolActivity({ phase: "matched", tools: event.tools });
                    subsRef.current.notify();
                } else if (event.type === "tool_priming_end") {
                    setToolActivity(TOOL_ACTIVITY_IDLE);
                    subsRef.current.notify();
                } else if (event.type === "done") {
                    // Stream finished
                }
            }

            const tools = [...usedToolsRef.current];
            const assistantMsg: TrackedChatMessage = {
                id: assistantMsgId,
                role: "assistant",
                content: accumulated,
                inResponseTo: userMsgId,
                status: "complete",
                pinned: false,
                ...(tools.length > 0 ? { usedTools: tools } : {}),
            };
            appendMessage(assistantMsg);
            setStreamingContent("");
            setStreamingMessageId(null);
            setToolActivity(TOOL_ACTIVITY_IDLE);
            refreshTokenState();
            subsRef.current.notify();
            return userMsgId;
        } catch (err) {
            if (controller.signal.aborted) {
                if (accumulated.length > 0) {
                    const partialMsg: TrackedChatMessage = {
                        id: assistantMsgId,
                        role: "assistant",
                        content: accumulated,
                        inResponseTo: userMsgId,
                        status: "complete",
                        pinned: false,
                    };
                    appendMessage(partialMsg);
                }
                setStreamingContent("");
                setStreamingMessageId(null);
                return userMsgId;
            }
            setError(err as ArlopassSDKError);
            updateMessage(userMsgId, { status: "error" });
            setStreamingContent("");
            setStreamingMessageId(null);
            throw err;
        } finally {
            busyRef.current = false;
            setIsStreaming(false);
            setToolActivity(TOOL_ACTIVITY_IDLE);
            abortRef.current = null;
        }
    }, [store, appendMessage, updateMessage, refreshTokenState]);

    const stop = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
    }, []);

    const clearMessages = useCallback(() => {
        managerRef.current!.clear();
        messagesRef.current = [];
        setMessages([]);
        setStreamingContent("");
        setStreamingMessageId(null);
        setIsStreaming(false);
        setIsSending(false);
        setError(null);
        setTokenCount(0);
        setContextWindow([]);
        setStateContextInfo({ maxTokens: 0, usedTokens: 0, reservedOutputTokens: 0, remainingTokens: 0, usageRatio: 0 });
        setToolActivity(TOOL_ACTIVITY_IDLE);
        usedToolsRef.current = [];
        busyRef.current = false;
        lastRequestRef.current = null;
    }, []);

    const pinMessage = useCallback((messageId: MessageId, pinned: boolean) => {
        const idx = messagesRef.current.findIndex((m) => m.id === messageId);
        if (idx === -1) return;
        updateMessage(messageId, { pinned });
        managerRef.current!.setPin(idx, pinned);
    }, [updateMessage]);

    const submitToolResult = useCallback((toolCallId: string, result: string) => {
        managerRef.current!.submitToolResult(toolCallId, result);
    }, []);

    const retry = error !== null && (error as ArlopassSDKError & { retryable?: boolean }).retryable === true && lastRequestRef.current !== null
        ? async () => {
            setError(null);
            const req = lastRequestRef.current!;
            if (req.type === "send") {
                await send(req.content, req.pinned !== undefined ? { pinned: req.pinned } : undefined);
            } else {
                await stream(req.content, req.pinned !== undefined ? { pinned: req.pinned } : undefined);
            }
        }
        : null;

    const subscribe = useCallback((...args: unknown[]) => {
        const event = args[0] as string;
        const handler = (args.length === 3 ? args[2] : args[1]) as () => void;
        return subsRef.current.subscribe(() => {
            if (
                event === "response" ||
                event === "stream" ||
                event === "error" ||
                event === "tool_call" ||
                event === "tool_result" ||
                event === "tool_priming_start" ||
                event === "tool_priming_match" ||
                event === "tool_priming_end"
            ) {
                handler();
            }
        });
    }, []) as unknown as ChatSubscribe;

    return {
        messages,
        streamingContent,
        streamingMessageId,
        isStreaming,
        isSending,
        error,
        tokenCount,
        contextWindow,
        contextInfo,
        toolActivity,
        send,
        stream,
        stop,
        clearMessages,
        pinMessage,
        submitToolResult,
        retry,
        subscribe,
    };
}
