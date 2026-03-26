import type { ToolCall, ToolDefinition, ToolResult } from "./tools.js";

let nextToolCallId = 0;

function generateToolCallId(): string {
  return `tc_${String(++nextToolCallId).padStart(4, "0")}_${Date.now().toString(36)}`;
}

/**
 * Parse tool calls from model response text.
 * Supports multiple formats that LLMs commonly produce:
 * 1. XML tags: <tool_call>{"name":"x","arguments":{}}</tool_call>
 * 2. JSON code blocks: ```json\n{"name":"x","arguments":{}}\n``` or ```\n{"name":"x"...}\n```
 * 3. Bare JSON objects with "name" and "arguments" keys
 * 4. Function-call syntax: tool_name(arg1, arg2) or tool_name({"key":"val"})
 *
 * When `knownToolNames` is provided, the parser also matches unstructured
 * calls like `search_docs "closures"` or `navigate_to_page providers`.
 */
export function parseToolCalls(
  text: string,
  knownToolNames?: readonly string[],
  toolDefinitions?: readonly ToolDefinition[],
): {
  toolCalls: ToolCall[];
  textBefore: string;
  textAfter: string;
  /** All match ranges (useful for highlighting/stripping). */
  matchRanges: Array<{ start: number; end: number }>;
} {
  const toolCalls: ToolCall[] = [];
  const matchRanges: Array<{ start: number; end: number }> = [];
  let firstMatchIndex = -1;
  let lastMatchEnd = 0;

  function trackMatch(index: number, end: number): { start: number; end: number } {
    if (firstMatchIndex === -1) firstMatchIndex = index;
    if (end > lastMatchEnd) lastMatchEnd = end;
    const range = { start: index, end };
    matchRanges.push(range);
    return range;
  }

  // Strategy 1: XML tags — <tool_call>JSON</tool_call>
  const xmlRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = xmlRegex.exec(text)) !== null) {
    const range = trackMatch(match.index, match.index + match[0].length);
    const call = tryParseToolCallJson(match[1]!.trim(), range);
    if (call !== null) toolCalls.push(call);
  }

  // Strategy 2: JSON in fenced code blocks — ```json\n{...}\n``` or ```\n{...}\n```
  if (toolCalls.length === 0) {
    const codeBlockRegex = /```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/g;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      const range = { start: match.index, end: match.index + match[0].length };
      const call = tryParseToolCallJson(match[1]!.trim(), range);
      if (call !== null) {
        trackMatch(match.index, match.index + match[0].length);
        toolCalls.push(call);
      }
    }
  }

  // Strategy 3: Bare JSON object with "name" field on its own line
  if (toolCalls.length === 0) {
    const bareJsonRegex = /^\s*(\{"name"\s*:\s*"[^"]+?"[\s\S]*?\})\s*$/gm;
    while ((match = bareJsonRegex.exec(text)) !== null) {
      const range = { start: match.index, end: match.index + match[0].length };
      const call = tryParseToolCallJson(match[1]!.trim(), range);
      if (call !== null) {
        trackMatch(match.index, match.index + match[0].length);
        toolCalls.push(call);
      }
    }
  }

  // Strategy 4: Loose matching — tool_name followed by args at start of line or after punctuation
  // Catches: "navigate_to_page providers", "search_docs("closures")", "`search_docs` query"
  // Requires tool name at line start or after colon/backtick to avoid matching in prose
  if (toolCalls.length === 0 && knownToolNames !== undefined && knownToolNames.length > 0) {
    const escapedNames = knownToolNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const fnCallRegex = new RegExp(
      `(?:^|[:\`*])\\s*(${escapedNames.join("|")})(?:\`)?(?:\\(([\\s\\S]*?)\\)|[ \\t]+([^\\n<]{1,200}))`,
      "gm",
    );
    while ((match = fnCallRegex.exec(text)) !== null) {
      const name = match[1]!;
      const parenArgs = match[2]?.trim();
      const spaceArgs = match[3]?.trim();
      const rawArgs = parenArgs ?? spaceArgs ?? "";
      const range = trackMatch(match.index, match.index + match[0].length);
      toolCalls.push(parseLooseToolCall(name, rawArgs, knownToolNames, range));
    }
  }

  // Strategy 5: JSON object with known parameter keys but missing "name" field
  // Catches: {"page_id":"streaming"}, ( {"query":"closures"} ), {"expression":"2+2"}
  // Reverse-maps parameter names to the correct tool definition
  if (toolCalls.length === 0 && toolDefinitions !== undefined && toolDefinitions.length > 0) {
    const jsonInTextRegex = /[({]\s*(\{[^}]+\})\s*[)}]|\{("[^"]+"\s*:\s*[^}]+)\}/g;
    while ((match = jsonInTextRegex.exec(text)) !== null) {
      const jsonStr = match[1] ?? `{${match[2]}}`;
      try {
        const parsed = JSON.parse(jsonStr.trim()) as Record<string, unknown>;
        // Skip if it already has a "name" field (Strategy 3 would have caught it)
        if (typeof parsed.name === "string") continue;
        // Try to match parameter keys to a tool definition
        const matchedTool = matchToolByParamKeys(parsed, toolDefinitions);
        if (matchedTool !== null) {
          const range = trackMatch(match.index, match.index + match[0].length);
          toolCalls.push({
            id: generateToolCallId(),
            name: matchedTool.name,
            arguments: parsed,
            matchRange: range,
          });
        }
      } catch {
        // Not valid JSON
      }
    }
  }

  const textBefore = firstMatchIndex >= 0 ? text.slice(0, firstMatchIndex) : text;
  const textAfter = lastMatchEnd > 0 ? text.slice(lastMatchEnd) : "";

  return { toolCalls, textBefore, textAfter, matchRanges };
}

/**
 * Remove tool call markup from text, leaving only the surrounding prose.
 * Uses the matchRanges from parseToolCalls to strip precisely.
 */
export function stripToolCalls(
  text: string,
  matchRanges: ReadonlyArray<{ start: number; end: number }>,
): string {
  if (matchRanges.length === 0) return text;
  // Sort ranges by start descending to splice from end first
  const sorted = [...matchRanges].sort((a, b) => b.start - a.start);
  let result = text;
  for (const range of sorted) {
    result = result.slice(0, range.start) + result.slice(range.end);
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Match a JSON object's keys to a tool definition by checking if any
 * required/defined parameter names appear as keys in the object.
 * Returns the best matching tool (most parameter key overlaps).
 */
function matchToolByParamKeys(
  obj: Record<string, unknown>,
  tools: readonly ToolDefinition[],
): ToolDefinition | null {
  const objKeys = new Set(Object.keys(obj));
  let bestTool: ToolDefinition | null = null;
  let bestScore = 0;

  for (const tool of tools) {
    if (tool.parameters?.properties === undefined) continue;
    const paramKeys = Object.keys(tool.parameters.properties);
    if (paramKeys.length === 0) continue;
    let matches = 0;
    for (const pk of paramKeys) {
      if (objKeys.has(pk)) matches++;
    }
    if (matches > 0 && matches > bestScore) {
      bestScore = matches;
      bestTool = tool;
    }
  }

  return bestTool;
}

/** Try parsing a JSON string as a tool call {name, arguments}. */
function tryParseToolCallJson(jsonStr: string, matchRange: { start: number; end: number }): ToolCall | null {
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    if (typeof parsed.name === "string") {
      return {
        id: generateToolCallId(),
        name: parsed.name,
        arguments: (typeof parsed.arguments === "object" && parsed.arguments !== null
          ? parsed.arguments
          : {}) as Record<string, unknown>,
        matchRange,
      };
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

/**
 * Parse a loose/unstructured tool call like:
 *   search_docs "closures"
 *   navigate_to_page providers
 *   calculate 2+2
 *   search_docs({"query": "closures"})
 */
function parseLooseToolCall(
  name: string,
  rawArgs: string,
  knownToolNames: readonly string[],
  matchRange: { start: number; end: number },
): ToolCall {
  // Try JSON first
  if (rawArgs.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
      return { id: generateToolCallId(), name, arguments: parsed, matchRange };
    } catch {
      // fall through
    }
  }

  // Try quoted string — e.g., search_docs "closures" or search_docs("closures")
  const quotedMatch = rawArgs.match(/^["'](.+?)["']$/);
  if (quotedMatch !== null) {
    return { id: generateToolCallId(), name, arguments: guessArgName(name, quotedMatch[1]!), matchRange };
  }

  // Bare string argument — e.g., navigate_to_page providers
  if (rawArgs.length > 0 && !rawArgs.includes("{")) {
    // Strip surrounding quotes, parens
    const cleaned = rawArgs.replace(/^[("'`]+|[)"'`]+$/g, "").trim();
    if (cleaned.length > 0) {
      return { id: generateToolCallId(), name, arguments: guessArgName(name, cleaned), matchRange };
    }
  }

  return { id: generateToolCallId(), name, arguments: {}, matchRange };
}

/**
 * Guess the argument key name for a single bare argument.
 * Uses simple heuristics: "query" for search names, "page_id" for navigation, first required param, etc.
 */
function guessArgName(toolName: string, value: string): Record<string, unknown> {
  if (toolName.includes("search") || toolName.includes("find") || toolName.includes("lookup")) {
    return { query: value };
  }
  if (toolName.includes("navigate") || toolName.includes("goto") || toolName.includes("page")) {
    return { page_id: value };
  }
  if (toolName.includes("calculate") || toolName.includes("eval") || toolName.includes("compute")) {
    return { expression: value };
  }
  // Default: use "input" as generic key
  return { input: value };
}

export function buildToolSystemPrompt(tools: readonly ToolDefinition[]): string {
  if (tools.length === 0) return "";

  const toolBlocks = tools.map((tool) => {
    const paramLine = tool.parameters !== undefined
      ? `\nParameters: ${JSON.stringify(tool.parameters)}`
      : "\nParameters: none";
    return `- ${tool.name}: ${tool.description}${paramLine}`;
  }).join("\n\n");

  // Build concrete few-shot examples from actual tool definitions
  const examples: string[] = [];
  for (const tool of tools.slice(0, 3)) {
    const exampleArgs: Record<string, string | number> = {};
    if (tool.parameters?.properties !== undefined) {
      for (const [key, schema] of Object.entries(tool.parameters.properties)) {
        if (schema.enum !== undefined && schema.enum.length > 0) {
          exampleArgs[key] = schema.enum[0]!;
        } else if (schema.type === "string") {
          exampleArgs[key] = schema.description ?? "example";
        } else {
          exampleArgs[key] = 0;
        }
      }
    }
    examples.push(`<tool_call>\n${JSON.stringify({ name: tool.name, arguments: exampleArgs })}\n</tool_call>`);
  }

  return `[TOOL USE INSTRUCTIONS]

You have access to tools. To call a tool, output a <tool_call> block with JSON inside.

TOOLS:
${toolBlocks}

FORMAT — copy this pattern EXACTLY:

${examples[0] ?? ""}

${examples.length > 1 ? `Another example:\n\n${examples[1]}\n` : ""}
RULES:
- You MUST wrap tool calls in <tool_call> and </tool_call> XML tags
- The JSON MUST have "name" (string) and "arguments" (object) fields
- NEVER write a tool name as plain text without the <tool_call> tags
- You CAN include normal text before or after the <tool_call> block
- After receiving a <tool_result>, use it to write your final answer
- If no tool is needed, respond normally

WRONG (do NOT do this):
navigate_to_page providers
search_docs "query"

CORRECT (ALWAYS do this):
<tool_call>
{"name": "navigate_to_page", "arguments": {"page_id": "providers"}}
</tool_call>`;
}

export function formatToolResults(results: readonly ToolResult[]): string {
  return results
    .map(
      (r) => `<tool_result name="${r.name}" tool_call_id="${r.toolCallId}">\n${r.result}\n</tool_result>`,
    )
    .join("\n\n");
}

/**
 * Lightweight client-side check: does the user message likely need a tool?
 * Checks for tool name substrings, parameter value keywords, and description words.
 * Zero LLM cost — pure string matching.
 */
export function shouldPrimeTools(
  userMessage: string,
  tools: readonly ToolDefinition[],
): boolean {
  if (tools.length === 0) return false;
  const lower = userMessage.toLowerCase();

  for (const tool of tools) {
    // Check tool name words (e.g., "navigate" from "navigate_to_page")
    const nameWords = tool.name.split(/[_\-.]/).filter((w) => w.length > 2);
    if (nameWords.some((w) => lower.includes(w.toLowerCase()))) return true;

    // Check description keywords
    const descWords = tool.description
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const matchCount = descWords.filter((w) => lower.includes(w)).length;
    if (matchCount >= 2) return true;

    // Check parameter enum values (e.g., page IDs like "streaming", "providers")
    if (tool.parameters?.properties !== undefined) {
      for (const prop of Object.values(tool.parameters.properties)) {
        if (prop.enum !== undefined) {
          if (prop.enum.some((v) => lower.includes(v.toLowerCase()))) return true;
        }
      }
    }
  }

  return false;
}

/**
 * Build a forceful priming message that tells the model exactly which tool
 * to use and how. Sent as a system-level instruction before the actual request
 * when tool priming is active.
 */
export function buildToolPrimingMessage(
  userMessage: string,
  tools: readonly ToolDefinition[],
): string {
  const toolSummaries = tools.map((t) => {
    const params = t.parameters?.properties !== undefined
      ? Object.entries(t.parameters.properties)
        .map(([k, v]) => `${k}: ${v.type}${v.enum ? ` (one of: ${v.enum.join(", ")})` : ""}`)
        .join(", ")
      : "none";
    return `- ${t.name}(${params}): ${t.description}`;
  }).join("\n");

  return `[TOOL SELECTION REQUIRED]

The user's message may require using a tool. Review the message and available tools below.

User message: "${userMessage}"

Available tools:
${toolSummaries}

INSTRUCTIONS:
- If a tool is appropriate, respond ONLY with a <tool_call> block. No other text.
- If no tool is needed, respond normally to the user's message.

Example of correct tool call:
<tool_call>
{"name": "tool_name", "arguments": {"param": "value"}}
</tool_call>

Respond now:`;
}
