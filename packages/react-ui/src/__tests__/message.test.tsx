"use client";

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Message } from "../message/index.js";
import type { TrackedChatMessage, ToolCallInfo } from "../types.js";

const sampleMessage: TrackedChatMessage = {
  id: "msg-1",
  role: "user",
  content: "Hello world",
  status: "complete",
  pinned: false,
};

const assistantMessage: TrackedChatMessage = {
  id: "msg-2",
  role: "assistant",
  content: "Hi there",
  status: "streaming",
  pinned: false,
};

const messageWithTools: TrackedChatMessage = {
  id: "msg-3",
  role: "assistant",
  content: "",
  status: "complete",
  pinned: false,
  toolCalls: [
    {
      toolCallId: "tc-1",
      name: "searchWeb",
      arguments: { query: "test" },
      status: "complete",
    },
  ],
};

const messageNoTools: TrackedChatMessage = {
  id: "msg-4",
  role: "assistant",
  content: "No tools",
  status: "complete",
  pinned: false,
  toolCalls: [],
};

describe("Message.Root", () => {
  it("renders with message prop", () => {
    render(
      <Message.Root message={sampleMessage} data-testid="root">
        <span>content</span>
      </Message.Root>,
    );
    const root = screen.getByTestId("root");
    expect(root).toBeDefined();
  });

  it("sets data-role and data-status", () => {
    render(
      <Message.Root message={sampleMessage} data-testid="root">
        <span>content</span>
      </Message.Root>,
    );
    const root = screen.getByTestId("root");
    expect(root.dataset.role).toBe("user");
    expect(root.dataset.status).toBe("complete");
  });

  it("forwards className", () => {
    render(
      <Message.Root message={sampleMessage} data-testid="root" className="my-class">
        <span>content</span>
      </Message.Root>,
    );
    expect(screen.getByTestId("root").className).toBe("my-class");
  });
});

describe("Message.Content", () => {
  it("renders message content text", () => {
    render(
      <Message.Root message={sampleMessage}>
        <Message.Content data-testid="content" />
      </Message.Root>,
    );
    expect(screen.getByTestId("content").textContent).toBe("Hello world");
  });

  it("sets data-role", () => {
    render(
      <Message.Root message={assistantMessage}>
        <Message.Content data-testid="content" />
      </Message.Root>,
    );
    expect(screen.getByTestId("content").dataset.role).toBe("assistant");
  });
});

describe("Message.Role", () => {
  it("renders 'User' for user role", () => {
    render(
      <Message.Root message={sampleMessage}>
        <Message.Role data-testid="role" />
      </Message.Root>,
    );
    expect(screen.getByTestId("role").textContent).toBe("User");
  });

  it("renders 'Assistant' for assistant role", () => {
    render(
      <Message.Root message={assistantMessage}>
        <Message.Role data-testid="role" />
      </Message.Root>,
    );
    expect(screen.getByTestId("role").textContent).toBe("Assistant");
  });

  it("sets data-role", () => {
    render(
      <Message.Root message={sampleMessage}>
        <Message.Role data-testid="role" />
      </Message.Root>,
    );
    expect(screen.getByTestId("role").dataset.role).toBe("user");
  });
});

describe("Message.Status", () => {
  it("renders status text", () => {
    render(
      <Message.Root message={assistantMessage}>
        <Message.Status data-testid="status" />
      </Message.Root>,
    );
    expect(screen.getByTestId("status").textContent).toBe("streaming");
  });

  it("sets data-status", () => {
    render(
      <Message.Root message={sampleMessage}>
        <Message.Status data-testid="status" />
      </Message.Root>,
    );
    expect(screen.getByTestId("status").dataset.status).toBe("complete");
  });
});

describe("Message.Timestamp", () => {
  it("renders ISO string by default", () => {
    const date = new Date("2025-01-15T10:30:00Z");
    render(
      <Message.Root message={sampleMessage}>
        <Message.Timestamp date={date} data-testid="time" />
      </Message.Root>,
    );
    const el = screen.getByTestId("time");
    expect(el.textContent).toBe("2025-01-15T10:30:00.000Z");
    expect(el.getAttribute("datetime")).toBe("2025-01-15T10:30:00.000Z");
  });

  it("uses format prop when provided", () => {
    const date = new Date("2025-01-15T10:30:00Z");
    render(
      <Message.Root message={sampleMessage}>
        <Message.Timestamp
          date={date}
          format={(d) => d.getFullYear().toString()}
          data-testid="time"
        />
      </Message.Root>,
    );
    expect(screen.getByTestId("time").textContent).toBe("2025");
  });

  it("uses children render function when provided", () => {
    const date = new Date("2025-01-15T10:30:00Z");
    render(
      <Message.Root message={sampleMessage}>
        <Message.Timestamp date={date} data-testid="time">
          {(d) => <strong>{d.toLocaleDateString()}</strong>}
        </Message.Timestamp>
      </Message.Root>,
    );
    expect(screen.getByTestId("time").querySelector("strong")).toBeDefined();
  });
});

describe("Message.ToolCalls", () => {
  it("data-state='has-tools' when toolCalls exist", () => {
    render(
      <Message.Root message={messageWithTools}>
        <Message.ToolCalls data-testid="tools">
          <span>tool content</span>
        </Message.ToolCalls>
      </Message.Root>,
    );
    expect(screen.getByTestId("tools").dataset.state).toBe("has-tools");
    expect(screen.getByTestId("tools").textContent).toBe("tool content");
  });

  it("data-state='empty' when no toolCalls", () => {
    render(
      <Message.Root message={messageNoTools}>
        <Message.ToolCalls data-testid="tools">
          <span>tool content</span>
        </Message.ToolCalls>
      </Message.Root>,
    );
    expect(screen.getByTestId("tools").dataset.state).toBe("empty");
    expect(screen.getByTestId("tools").textContent).toBe("");
  });

  it("data-state='empty' when toolCalls undefined", () => {
    render(
      <Message.Root message={sampleMessage}>
        <Message.ToolCalls data-testid="tools">
          <span>tool content</span>
        </Message.ToolCalls>
      </Message.Root>,
    );
    expect(screen.getByTestId("tools").dataset.state).toBe("empty");
  });
});

describe("Parts outside Message.Root", () => {
  it("Message.Content throws when used outside Message.Root", () => {
    expect(() => {
      render(<Message.Content />);
    }).toThrow("must be used within <Message.Root>");
  });

  it("Message.Role throws when used outside Message.Root", () => {
    expect(() => {
      render(<Message.Role />);
    }).toThrow("must be used within <Message.Root>");
  });

  it("Message.Status throws when used outside Message.Root", () => {
    expect(() => {
      render(<Message.Status />);
    }).toThrow("must be used within <Message.Root>");
  });

  it("Message.ToolCalls throws when used outside Message.Root", () => {
    expect(() => {
      render(<Message.ToolCalls>content</Message.ToolCalls>);
    }).toThrow("must be used within <Message.Root>");
  });
});
