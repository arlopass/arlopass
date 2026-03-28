import type { ArlopassClient } from "./client.js";
import type { ChatMessage, ContextWindowInfo } from "./types.js";
import type { ToolDefinition, ToolCall, ToolResult, ConversationStreamEvent } from "./tools.js";
import { estimateTokenCount } from "./token-estimation.js";
import { resolveModelContextWindow } from "./model-context-windows.js";
import { parseToolCalls, buildToolSystemPrompt, formatToolResults, shouldPrimeTools, buildToolPrimingMessage, stripToolCalls } from "./tool-parser.js";

type ManagedMessage = {
    message: ChatMessage;
    pinned: boolean;
    tokenEstimate: number;
    isSummary: boolean;
};

export type PinOptions = {
    pinned?: boolean;
    /** Force tool priming for this message (overrides ConversationManager-level setting). */
    primeTools?: boolean;
    /** Hide tool call markup from streamed/returned text. Overrides ConversationManager-level setting. */
    hideToolCalls?: boolean;
};

export type ConversationManagerOptions = {
    client: ArlopassClient;
    maxTokens?: number;
    reserveOutputTokens?: number;
    systemPrompt?: string;
    summarize?: boolean;
    summarizationPrompt?: string;
    /** Tool definitions available to the model. */
    tools?: ToolDefinition[];
    /** Max tool call rounds before returning text. Default: 5. */
    maxToolRounds?: number;
    /** Enable tool priming for all messages. Default: false. */
    primeTools?: boolean;
    /** Hide tool call markup from responses. Default: false. */
    hideToolCalls?: boolean;
};

const DEFAULT_RESERVE_OUTPUT_TOKENS = 1024;

export class ConversationManager {
    readonly #client: ArlopassClient;
    readonly #explicitMaxTokens: number | undefined;
    readonly #reserveOutputTokens: number;
    readonly #systemPrompt: string | undefined;
    readonly #summarize: boolean;
    readonly #summarizationPrompt: string;
    readonly #tools: readonly ToolDefinition[];
    readonly #maxToolRounds: number;
    readonly #toolSystemPrompt: string;
    readonly #primeToolsGlobal: boolean;
    readonly #hideToolCallsGlobal: boolean;
    #messages: ManagedMessage[] = [];
    #pendingToolResults = new Map<string, { resolve: (result: string) => void }>();

    constructor(options: ConversationManagerOptions) {
        this.#client = options.client;
        this.#reserveOutputTokens = options.reserveOutputTokens ?? DEFAULT_RESERVE_OUTPUT_TOKENS;
        this.#systemPrompt = options.systemPrompt;
        this.#summarize = options.summarize ?? false;
        this.#summarizationPrompt = options.summarizationPrompt
            ?? "Summarize the following conversation concisely, preserving key facts, decisions, and context. Be brief.";

        this.#tools = options.tools ?? [];
        this.#maxToolRounds = options.maxToolRounds ?? 5;
        this.#toolSystemPrompt = buildToolSystemPrompt(this.#tools);
        this.#primeToolsGlobal = options.primeTools ?? false;
        this.#hideToolCallsGlobal = options.hideToolCalls ?? false;

        this.#explicitMaxTokens = options.maxTokens;
    }

    get #maxTokens(): number {
        if (this.#explicitMaxTokens !== undefined) return this.#explicitMaxTokens;
        const modelId = this.#client.selectedProvider?.modelId ?? "";
        return resolveModelContextWindow(modelId);
    }

    get maxTokens(): number {
        return this.#maxTokens;
    }

    addMessage(message: ChatMessage, options?: PinOptions): void {
        this.#messages.push({
            message,
            pinned: options?.pinned ?? false,
            tokenEstimate: estimateTokenCount(message.content),
            isSummary: false,
        });
    }

    #getEffectiveSystemPrompt(): string | undefined {
        if (this.#systemPrompt !== undefined && this.#toolSystemPrompt.length > 0) {
            return `${this.#systemPrompt}\n\n${this.#toolSystemPrompt}`;
        }
        if (this.#toolSystemPrompt.length > 0) {
            return this.#toolSystemPrompt;
        }
        return this.#systemPrompt;
    }

    getMessages(): readonly ChatMessage[] {
        const result: ChatMessage[] = [];
        const effectiveSystemPrompt = this.#getEffectiveSystemPrompt();
        if (effectiveSystemPrompt !== undefined) {
            result.push({ role: "system", content: effectiveSystemPrompt });
        }
        for (const m of this.#messages) {
            result.push(m.message);
        }
        return result;
    }

    getContextWindow(): readonly ChatMessage[] {
        return this.#buildContextWindow();
    }

    getTokenCount(): number {
        const window = this.#buildContextWindow();
        let total = 0;
        for (const m of window) {
            total += estimateTokenCount(m.content);
        }
        return total;
    }

    getContextInfo(): ContextWindowInfo {
        const usedTokens = this.getTokenCount();
        const inputBudget = this.#maxTokens - this.#reserveOutputTokens;
        const remainingTokens = Math.max(0, inputBudget - usedTokens);
        const usageRatio = inputBudget > 0
            ? Math.min(1, usedTokens / inputBudget)
            : 0;

        return {
            maxTokens: this.#maxTokens,
            usedTokens,
            reservedOutputTokens: this.#reserveOutputTokens,
            remainingTokens,
            usageRatio,
        };
    }

    setPin(index: number, pinned: boolean): void {
        const offset = this.#systemPrompt !== undefined ? index - 1 : index;
        if (offset >= 0 && offset < this.#messages.length) {
            this.#messages[offset]!.pinned = pinned;
        }
    }

    clear(): void {
        this.#messages = [];
    }

    /**
     * Determine if tool priming should be used for this message.
     * Priority: per-message option > ConversationManager-level > client-side auto-detect.
     */
    #shouldPrime(content: string, options?: PinOptions): boolean {
        if (this.#tools.length === 0) return false;
        // Per-message explicit opt-in
        if (options?.primeTools === true) return true;
        // ConversationManager-level opt-in
        if (this.#primeToolsGlobal) return true;
        // Client-side auto-detect (zero LLM cost)
        return shouldPrimeTools(content, this.#tools);
    }

    /**
     * Determine if tool call markup should be hidden from responses.
     */
    #shouldHideToolCalls(options?: PinOptions): boolean {
        if (options?.hideToolCalls !== undefined) return options.hideToolCalls;
        return this.#hideToolCallsGlobal;
    }

    /**
     * Send a priming message to the model that instructs it to use tool_call
     * format. Returns the primed response text (which should contain tool calls).
     */
    async #primeAndSend(userContent: string, contextWindow: readonly ChatMessage[]): Promise<string> {
        const primingMessage = buildToolPrimingMessage(userContent, this.#tools);
        // Replace the last user message with the priming version
        const primedWindow: ChatMessage[] = [
            ...contextWindow.slice(0, -1),
            { role: "user", content: primingMessage },
        ];
        const result = await this.#client.chat.send({ messages: primedWindow });
        return result.message.content;
    }

    async send(content: string, options?: PinOptions): Promise<ChatMessage> {
        this.addMessage({ role: "user", content }, options);
        const shouldPrime = this.#shouldPrime(content, options);
        const hideToolMarkup = this.#shouldHideToolCalls(options);

        for (let round = 0; round < this.#maxToolRounds; round++) {
            const contextWindow = await this.#prepareContextWindow();

            let responseText: string;
            if (round === 0 && shouldPrime) {
                // First round with priming: send a forceful tool-selection prompt
                responseText = await this.#primeAndSend(content, contextWindow);
            } else {
                const result = await this.#client.chat.send({ messages: contextWindow });
                responseText = result.message.content;
            }

            const parsed = parseToolCalls(responseText, this.#tools.map((t) => t.name), this.#tools);
            if (parsed.toolCalls.length === 0 || this.#tools.length === 0) {
                const message: ChatMessage = { role: "assistant", content: responseText };
                this.#messages.push({
                    message,
                    pinned: false,
                    tokenEstimate: estimateTokenCount(responseText),
                    isSummary: false,
                });
                return message;
            }

            // Tool calls found — execute all (send requires handlers)
            const storedContent = hideToolMarkup
                ? stripToolCalls(responseText, parsed.matchRanges).trim()
                : responseText;
            if (storedContent.length > 0) {
                this.#messages.push({
                    message: { role: "assistant", content: storedContent },
                    pinned: false,
                    tokenEstimate: estimateTokenCount(storedContent),
                    isSummary: false,
                });
            }

            const toolResults = await this.#executeToolCalls(parsed.toolCalls);
            const resultMessage = formatToolResults(toolResults);
            this.addMessage({ role: "user", content: resultMessage });
        }

        // maxToolRounds exceeded
        const lastAssistant = [...this.#messages].reverse().find((m) => m.message.role === "assistant");
        return lastAssistant?.message ?? { role: "assistant", content: "" };
    }

    async *stream(content: string, options?: PinOptions): AsyncIterable<ConversationStreamEvent> {
        this.addMessage({ role: "user", content }, options);
        const shouldPrime = this.#shouldPrime(content, options);
        const hideToolMarkup = this.#shouldHideToolCalls(options);

        for (let round = 0; round < this.#maxToolRounds; round++) {
            const contextWindow = await this.#prepareContextWindow();
            let fullContent = "";
            let chunksAlreadyYielded = false;

            if (round === 0 && shouldPrime) {
                // Yield priming lifecycle events for UI feedback
                yield { type: "tool_priming_start" as const, message: "Looking for available tools..." };

                fullContent = await this.#primeAndSend(content, contextWindow);

                // Parse to see which tools were found
                const primeParsed = parseToolCalls(fullContent, this.#tools.map((t) => t.name), this.#tools);
                if (primeParsed.toolCalls.length > 0) {
                    yield {
                        type: "tool_priming_match" as const,
                        tools: primeParsed.toolCalls.map((c) => c.name),
                    };
                }
                yield { type: "tool_priming_end" as const };
            } else {
                // Normal streaming
                for await (const event of this.#client.chat.stream({ messages: contextWindow })) {
                    if (event.type === "chunk") {
                        fullContent += event.delta;
                        chunksAlreadyYielded = true;
                        yield event;
                    }
                }
            }

            if (fullContent.length > 0) {
                // Store the response (optionally with tool markup stripped)
                const parsed = parseToolCalls(fullContent, this.#tools.map((t) => t.name), this.#tools);
                const storedContent = hideToolMarkup && parsed.matchRanges.length > 0
                    ? stripToolCalls(fullContent, parsed.matchRanges)
                    : fullContent;
                // Only store if there's actual content after stripping
                if (storedContent.trim().length > 0) {
                    this.#messages.push({
                        message: { role: "assistant", content: storedContent },
                        pinned: false,
                        tokenEstimate: estimateTokenCount(storedContent),
                        isSummary: false,
                    });
                }
            }

            const parsed = parseToolCalls(fullContent, this.#tools.map((t) => t.name), this.#tools);
            if (parsed.toolCalls.length === 0 || this.#tools.length === 0) {
                // No tool calls — this is the final response.
                // If content was NOT already yielded as chunks (e.g. priming
                // used non-streaming chat.send), yield it now so the UI can
                // display it.
                if (!chunksAlreadyYielded && fullContent.length > 0) {
                    const displayContent = hideToolMarkup && parsed.matchRanges.length > 0
                        ? stripToolCalls(fullContent, parsed.matchRanges).trim()
                        : fullContent;
                    if (displayContent.length > 0) {
                        yield { type: "chunk" as const, delta: displayContent, index: 0, correlationId: "" };
                    }
                }
                yield { type: "done" as const, correlationId: "" };
                return;
            }

            // Yield tool_call events with matchRange
            for (const call of parsed.toolCalls) {
                yield {
                    type: "tool_call" as const,
                    toolCallId: call.id,
                    name: call.name,
                    arguments: call.arguments,
                    matchRange: call.matchRange,
                };
            }

            // Execute tools (auto for handlers, wait for manual)
            const toolResults: ToolResult[] = [];
            for (const call of parsed.toolCalls) {
                const tool = this.#tools.find((t) => t.name === call.name);
                if (tool?.handler !== undefined) {
                    try {
                        const result = await tool.handler(call.arguments);
                        toolResults.push({ toolCallId: call.id, name: call.name, result });
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        toolResults.push({
                            toolCallId: call.id,
                            name: call.name,
                            result: JSON.stringify({ error: `Tool execution failed: ${message}` }),
                        });
                    }
                } else {
                    // Manual mode — wait for submitToolResult
                    const result = await new Promise<string>((resolve) => {
                        this.#pendingToolResults.set(call.id, { resolve });
                    });
                    toolResults.push({ toolCallId: call.id, name: call.name, result });
                }

                // Yield tool_result event
                const lastResult = toolResults[toolResults.length - 1]!;
                yield {
                    type: "tool_result" as const,
                    toolCallId: lastResult.toolCallId,
                    name: lastResult.name,
                    result: lastResult.result,
                };
            }

            const resultMessage = formatToolResults(toolResults);
            this.addMessage({ role: "user", content: resultMessage });
            // Loop continues with next round
        }
        // maxToolRounds exhausted — yield final done
        yield { type: "done" as const, correlationId: "" };
    }

    submitToolResult(toolCallId: string, result: string): void {
        const pending = this.#pendingToolResults.get(toolCallId);
        if (pending !== undefined) {
            pending.resolve(result);
            this.#pendingToolResults.delete(toolCallId);
        }
    }

    #buildContextWindow(): ChatMessage[] {
        const budget = this.#maxTokens - this.#reserveOutputTokens;
        let remaining = budget;
        const result: ChatMessage[] = [];

        const effectiveSystemPrompt = this.#getEffectiveSystemPrompt();
        if (effectiveSystemPrompt !== undefined) {
            const tokens = estimateTokenCount(effectiveSystemPrompt);
            remaining -= tokens;
            result.push({ role: "system", content: effectiveSystemPrompt });
        }

        const pinned: ManagedMessage[] = [];
        const nonPinned: ManagedMessage[] = [];
        for (const m of this.#messages) {
            if (m.pinned) {
                pinned.push(m);
            } else {
                nonPinned.push(m);
            }
        }

        for (const m of pinned) {
            remaining -= m.tokenEstimate;
        }

        const includedNonPinned: ManagedMessage[] = [];
        for (let i = nonPinned.length - 1; i >= 0; i--) {
            const m = nonPinned[i]!;
            if (remaining - m.tokenEstimate >= 0) {
                remaining -= m.tokenEstimate;
                includedNonPinned.unshift(m);
            } else {
                break;
            }
        }

        const includedSet = new Set<ManagedMessage>([...pinned, ...includedNonPinned]);
        for (const m of this.#messages) {
            if (includedSet.has(m)) {
                result.push(m.message);
            }
        }

        return result;
    }

    async #executeToolCalls(toolCalls: readonly ToolCall[]): Promise<ToolResult[]> {
        const results: ToolResult[] = [];
        for (const call of toolCalls) {
            const tool = this.#tools.find((t) => t.name === call.name);
            if (tool?.handler === undefined) {
                results.push({
                    toolCallId: call.id,
                    name: call.name,
                    result: JSON.stringify({ error: `Tool "${call.name}" has no handler. Use stream() for manual tool handling.` }),
                });
                continue;
            }
            try {
                const result = await tool.handler(call.arguments);
                results.push({ toolCallId: call.id, name: call.name, result });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                results.push({
                    toolCallId: call.id,
                    name: call.name,
                    result: JSON.stringify({ error: `Tool execution failed: ${message}` }),
                });
            }
        }
        return results;
    }

    async #prepareContextWindow(): Promise<readonly ChatMessage[]> {
        if (!this.#summarize) {
            return this.#buildContextWindow();
        }

        const contextWindow = this.#buildContextWindow();
        const allMessages = this.getMessages();
        if (contextWindow.length >= allMessages.length) {
            return contextWindow;
        }

        const contextSet = new Set(contextWindow.map((m) => m.content));
        const evicted: ManagedMessage[] = [];
        for (const m of this.#messages) {
            if (!m.pinned && !m.isSummary && !contextSet.has(m.message.content)) {
                evicted.push(m);
            }
        }

        if (evicted.length === 0) {
            return contextWindow;
        }

        const evictedText = evicted
            .map((m) => `${m.message.role}: ${m.message.content}`)
            .join("\n");

        try {
            const summaryResult = await this.#client.chat.send({
                messages: [
                    { role: "system", content: this.#summarizationPrompt },
                    { role: "user", content: evictedText },
                ],
            });

            this.#messages = this.#messages.filter((m) => !m.isSummary);
            const evictedSet = new Set(evicted);
            this.#messages = this.#messages.filter((m) => !evictedSet.has(m));

            this.#messages.unshift({
                message: { role: "assistant", content: summaryResult.message.content },
                pinned: true,
                tokenEstimate: estimateTokenCount(summaryResult.message.content),
                isSummary: true,
            });

            return this.#buildContextWindow();
        } catch {
            return contextWindow;
        }
    }
}
