import type { ChatMessage } from "@arlopass/web-sdk";

type UIMessageLike = Readonly<{
    id: string;
    role: "system" | "user" | "assistant";
    parts: ReadonlyArray<{ type: string; text?: string }>;
}>;

export function convertMessages(messages: readonly UIMessageLike[]): ChatMessage[] {
    const result: ChatMessage[] = [];

    for (const msg of messages) {
        const textParts: string[] = [];
        for (const part of msg.parts) {
            if (part.type === "text" && typeof part.text === "string" && part.text.length > 0) {
                textParts.push(part.text);
            }
        }
        if (textParts.length === 0) continue;

        result.push({
            role: msg.role,
            content: textParts.join("\n"),
        });
    }

    return result;
}
