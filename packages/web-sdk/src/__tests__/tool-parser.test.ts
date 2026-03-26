import { describe, expect, it } from "vitest";
import {
  parseToolCalls,
  buildToolSystemPrompt,
  formatToolResults,
} from "../tool-parser.js";
import type { ToolDefinition, ToolResult } from "../tools.js";

describe("parseToolCalls", () => {
  it("returns no tool calls for plain text", () => {
    const result = parseToolCalls("Hello, this is a normal response.");
    expect(result.toolCalls).toHaveLength(0);
    expect(result.textBefore).toBe("Hello, this is a normal response.");
    expect(result.textAfter).toBe("");
  });

  it("parses a single tool call", () => {
    const text = 'Let me search for that.\n<tool_call>\n{"name": "search", "arguments": {"query": "closures"}}\n</tool_call>';
    const result = parseToolCalls(text);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("search");
    expect(result.toolCalls[0]!.arguments).toEqual({ query: "closures" });
    expect(result.toolCalls[0]!.id).toMatch(/^tc_/);
    expect(result.textBefore.trim()).toBe("Let me search for that.");
  });

  it("parses multiple tool calls", () => {
    const text = '<tool_call>\n{"name": "a", "arguments": {}}\n</tool_call>\n<tool_call>\n{"name": "b", "arguments": {"x": 1}}\n</tool_call>';
    const result = parseToolCalls(text);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]!.name).toBe("a");
    expect(result.toolCalls[1]!.name).toBe("b");
  });

  it("skips malformed JSON inside tool_call tags", () => {
    const text = '<tool_call>\nnot json\n</tool_call>\n<tool_call>\n{"name": "good", "arguments": {}}\n</tool_call>';
    const result = parseToolCalls(text);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("good");
  });

  it("captures text after tool calls", () => {
    const text = '<tool_call>\n{"name": "a", "arguments": {}}\n</tool_call>\nSome trailing text.';
    const result = parseToolCalls(text);
    expect(result.textAfter.trim()).toBe("Some trailing text.");
  });

  it("generates unique IDs for each call", () => {
    const text = '<tool_call>\n{"name": "a", "arguments": {}}\n</tool_call>\n<tool_call>\n{"name": "b", "arguments": {}}\n</tool_call>';
    const result = parseToolCalls(text);
    expect(result.toolCalls[0]!.id).not.toBe(result.toolCalls[1]!.id);
  });
});

describe("buildToolSystemPrompt", () => {
  it("builds prompt with tool definitions", () => {
    const tools: ToolDefinition[] = [
      {
        name: "search",
        description: "Search documents",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Search query" } },
          required: ["query"],
        },
      },
    ];
    const prompt = buildToolSystemPrompt(tools);
    expect(prompt).toContain("search");
    expect(prompt).toContain("Search documents");
    expect(prompt).toContain("<tool_call>");
    expect(prompt).toContain("<tool");
  });

  it("handles tools without parameters", () => {
    const tools: ToolDefinition[] = [
      { name: "get_time", description: "Get current time" },
    ];
    const prompt = buildToolSystemPrompt(tools);
    expect(prompt).toContain("get_time");
    expect(prompt).toContain("Get current time");
  });

  it("returns empty string for no tools", () => {
    expect(buildToolSystemPrompt([])).toBe("");
  });
});

describe("formatToolResults", () => {
  it("formats a single tool result", () => {
    const results: ToolResult[] = [
      { toolCallId: "tc_001", name: "search", result: '{"found": true}' },
    ];
    const formatted = formatToolResults(results);
    expect(formatted).toContain('<tool_result name="search" tool_call_id="tc_001">');
    expect(formatted).toContain('{"found": true}');
    expect(formatted).toContain("</tool_result>");
  });

  it("formats multiple results", () => {
    const results: ToolResult[] = [
      { toolCallId: "tc_001", name: "a", result: "result_a" },
      { toolCallId: "tc_002", name: "b", result: "result_b" },
    ];
    const formatted = formatToolResults(results);
    expect(formatted).toContain("tc_001");
    expect(formatted).toContain("tc_002");
  });
});

describe("parseToolCalls — multi-strategy", () => {
  const knownTools = ["search_docs", "navigate_to_page", "get_time"];

  it("parses bare JSON object without XML tags", () => {
    const text = '{"name": "navigate_to_page", "arguments": {"page_id": "providers"}}';
    const result = parseToolCalls(text, knownTools);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("navigate_to_page");
    expect(result.toolCalls[0]!.arguments).toEqual({ page_id: "providers" });
  });

  it("parses JSON in markdown code block", () => {
    const text = 'Sure, let me search:\n```json\n{"name": "search_docs", "arguments": {"query": "closures"}}\n```';
    const result = parseToolCalls(text, knownTools);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("search_docs");
  });

  it("parses loose function-call syntax with parens", () => {
    const text = 'search_docs({"query": "closures"})';
    const result = parseToolCalls(text, knownTools);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("search_docs");
    expect(result.toolCalls[0]!.arguments).toEqual({ query: "closures" });
  });

  it("parses loose tool name with space-separated argument", () => {
    const text = "navigate_to_page providers";
    const result = parseToolCalls(text, knownTools);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("navigate_to_page");
    expect(result.toolCalls[0]!.arguments).toEqual({ page_id: "providers" });
  });

  it("does not match tool name embedded in prose", () => {
    const text = "I'll use navigate_to_page providers to take you there.";
    const result = parseToolCalls(text, knownTools);
    expect(result.toolCalls).toHaveLength(0);
  });

  it("matches tool name at start of line", () => {
    const text = "Let me help.\nnavigate_to_page providers";
    const result = parseToolCalls(text, knownTools);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("navigate_to_page");
  });

  it("prefers XML tags over loose matching", () => {
    const text = '<tool_call>\n{"name": "search_docs", "arguments": {"query": "test"}}\n</tool_call>';
    const result = parseToolCalls(text, knownTools);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("search_docs");
    expect(result.toolCalls[0]!.arguments).toEqual({ query: "test" });
  });

  it("does not match tool names when knownToolNames is not provided", () => {
    const text = "navigate_to_page providers";
    const result = parseToolCalls(text);
    expect(result.toolCalls).toHaveLength(0);
  });
});

describe("parseToolCalls — Strategy 5: param-key reverse mapping", () => {
  const toolDefs: ToolDefinition[] = [
    {
      name: "navigate_to_page",
      description: "Navigate",
      parameters: { type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"] },
    },
    {
      name: "search_docs",
      description: "Search",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  ];
  const names = toolDefs.map((t) => t.name);

  it("matches JSON with page_id to navigate_to_page", () => {
    const text = '( {"page_id": "streaming"} )';
    const result = parseToolCalls(text, names, toolDefs);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("navigate_to_page");
    expect(result.toolCalls[0]!.arguments).toEqual({ page_id: "streaming" });
  });

  it("matches bare JSON with query to search_docs", () => {
    const text = '{"query": "closures"}';
    const result = parseToolCalls(text, names, toolDefs);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("search_docs");
    expect(result.toolCalls[0]!.arguments).toEqual({ query: "closures" });
  });

  it("matches JSON with extra junk fields from model", () => {
    const text = '{"page_id": "streaming", "query": "BYOM stream"}';
    const result = parseToolCalls(text, names, toolDefs);
    expect(result.toolCalls).toHaveLength(1);
    // page_id matches navigate, query matches search — both have score 1
    // First tool in definitions wins at equal score
    expect(result.toolCalls[0]!.name).toBeDefined();
  });

  it("does not match JSON without any known param keys", () => {
    const text = '{"foo": "bar"}';
    const result = parseToolCalls(text, names, toolDefs);
    expect(result.toolCalls).toHaveLength(0);
  });

  it("does not trigger when XML tags already matched", () => {
    const text = '<tool_call>\n{"name": "search_docs", "arguments": {"query": "test"}}\n</tool_call>';
    const result = parseToolCalls(text, names, toolDefs);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("search_docs");
    // Strategy 1 matched, Strategy 5 should not run
  });
});

describe("buildToolSystemPrompt — strength", () => {
  it("includes WRONG/CORRECT examples for small models", () => {
    const tools: ToolDefinition[] = [
      {
        name: "navigate_to_page",
        description: "Navigate to a page",
        parameters: { type: "object", properties: { page_id: { type: "string" } }, required: ["page_id"] },
      },
    ];
    const prompt = buildToolSystemPrompt(tools);
    expect(prompt).toContain("WRONG");
    expect(prompt).toContain("CORRECT");
    expect(prompt).toContain("navigate_to_page");
    expect(prompt).toContain("<tool_call>");
    expect(prompt).toContain("</tool_call>");
  });

  it("generates concrete examples from tool definitions", () => {
    const tools: ToolDefinition[] = [
      {
        name: "search_docs",
        description: "Search docs",
        parameters: { type: "object", properties: { query: { type: "string", description: "Search query" } } },
      },
      {
        name: "get_time",
        description: "Get time",
      },
    ];
    const prompt = buildToolSystemPrompt(tools);
    // Should have example with actual tool name
    expect(prompt).toContain('"name":"search_docs"');
    expect(prompt).toContain("Another example");
  });
});
