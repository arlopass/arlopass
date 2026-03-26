"use client";

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolActivity } from "../tool-activity/index.js";
import type { ToolCallInfo } from "../types.js";

const pendingCall: ToolCallInfo = {
  toolCallId: "tc-1",
  name: "searchWeb",
  arguments: { query: "test" },
  status: "pending",
};

const completeCall: ToolCallInfo = {
  toolCallId: "tc-2",
  name: "readFile",
  arguments: { path: "/tmp" },
  result: "file contents",
  status: "complete",
};

const executingCall: ToolCallInfo = {
  toolCallId: "tc-3",
  name: "runCode",
  arguments: {},
  status: "executing",
};

describe("ToolActivity.Root", () => {
  it("data-state='active' when non-complete tool calls exist", () => {
    render(
      <ToolActivity.Root toolCalls={[pendingCall]} data-testid="root">
        <span>content</span>
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("root").dataset.state).toBe("active");
  });

  it("data-state='idle' when all tool calls complete", () => {
    render(
      <ToolActivity.Root toolCalls={[completeCall]} data-testid="root">
        <span>content</span>
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("root").dataset.state).toBe("idle");
  });

  it("data-state='idle' when no tool calls", () => {
    render(
      <ToolActivity.Root data-testid="root">
        <span>content</span>
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("root").dataset.state).toBe("idle");
  });

  it("data-state='active' with mixed statuses", () => {
    render(
      <ToolActivity.Root
        toolCalls={[completeCall, executingCall]}
        data-testid="root"
      >
        <span>content</span>
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("root").dataset.state).toBe("active");
  });

  it("forwards className", () => {
    render(
      <ToolActivity.Root className="my-class" data-testid="root">
        <span>content</span>
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("root").className).toBe("my-class");
  });
});

describe("ToolActivity.Call", () => {
  it("renders tool name", () => {
    render(
      <ToolActivity.Root toolCalls={[pendingCall]}>
        <ToolActivity.Call toolCall={pendingCall} data-testid="call" />
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("call").textContent).toBe("searchWeb");
  });

  it("sets data-status from toolCall", () => {
    render(
      <ToolActivity.Root toolCalls={[pendingCall]}>
        <ToolActivity.Call toolCall={pendingCall} data-testid="call" />
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("call").dataset.status).toBe("pending");
  });

  it("data-status='executing' for executing call", () => {
    render(
      <ToolActivity.Root toolCalls={[executingCall]}>
        <ToolActivity.Call toolCall={executingCall} data-testid="call" />
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("call").dataset.status).toBe("executing");
  });

  it("supports render function children", () => {
    render(
      <ToolActivity.Root toolCalls={[pendingCall]}>
        <ToolActivity.Call toolCall={pendingCall} data-testid="call">
          {(tc) => <strong>{tc.name}</strong>}
        </ToolActivity.Call>
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("call").querySelector("strong")).toBeDefined();
    expect(screen.getByTestId("call").textContent).toBe("searchWeb");
  });
});

describe("ToolActivity.Result", () => {
  it("renders result text", () => {
    render(
      <ToolActivity.Root toolCalls={[completeCall]}>
        <ToolActivity.Result toolCall={completeCall} data-testid="result" />
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("result").textContent).toBe("file contents");
  });

  it("sets data-status from toolCall", () => {
    render(
      <ToolActivity.Root toolCalls={[completeCall]}>
        <ToolActivity.Result toolCall={completeCall} data-testid="result" />
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("result").dataset.status).toBe("complete");
  });

  it("renders empty when no result", () => {
    render(
      <ToolActivity.Root toolCalls={[pendingCall]}>
        <ToolActivity.Result toolCall={pendingCall} data-testid="result" />
      </ToolActivity.Root>,
    );
    expect(screen.getByTestId("result").textContent).toBe("");
  });
});
