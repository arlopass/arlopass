"use client";

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { ArlopassProvider } from "@arlopass/react";
import { Chat } from "../chat/index.js";
import type { TrackedChatMessage } from "../types.js";

function setup() {
  const mockTransport = {
    request: vi.fn().mockResolvedValue({ envelope: {} }),
    stream: vi.fn(),
  };
  (window as unknown as Record<string, unknown>).arlopass = mockTransport;
  return mockTransport;
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).arlopass;
});

beforeEach(() => {
  setup();
});

function Wrapper({ children }: { children: ReactNode }) {
  return <ArlopassProvider appId="test">{children}</ArlopassProvider>;
}

const sampleMessage: TrackedChatMessage = {
  id: "msg-1",
  role: "user",
  content: "Hello",
  status: "complete",
  pinned: false,
};

describe("Chat.Root", () => {
  it("renders in uncontrolled mode inside ArlopassProvider", () => {
    render(
      <Wrapper>
        <Chat.Root data-testid="root">
          <span>content</span>
        </Chat.Root>
      </Wrapper>,
    );
    const root = screen.getByTestId("root");
    expect(root).toBeDefined();
    expect(root.dataset.state).toBe("idle");
  });

  it("renders in controlled mode with messages=[]", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]} data-testid="root">
          <span>content</span>
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("root")).toBeDefined();
  });
});

describe("Chat.EmptyState", () => {
  it("shows when no messages", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]}>
          <Chat.EmptyState data-testid="empty">No messages</Chat.EmptyState>
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("empty").textContent).toBe("No messages");
  });

  it("hides when there are messages", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[sampleMessage]}>
          <Chat.EmptyState data-testid="empty">No messages</Chat.EmptyState>
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.queryByTestId("empty")).toBeNull();
  });
});

describe("Chat.Messages", () => {
  it("data-state reflects empty when no messages", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]}>
          <Chat.Messages data-testid="messages">
            {(msgs) => msgs.map((m) => <div key={m.id}>{m.content}</div>)}
          </Chat.Messages>
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("messages").dataset.state).toBe("empty");
  });

  it("data-state reflects filled when messages present", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[sampleMessage]}>
          <Chat.Messages data-testid="messages">
            {(msgs) => msgs.map((m) => <div key={m.id}>{m.content}</div>)}
          </Chat.Messages>
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("messages").dataset.state).toBe("filled");
  });
});

describe("Chat.Input", () => {
  it("has aria-label", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]}>
          <Chat.Input />
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByLabelText("Chat message")).toBeDefined();
  });
});

describe("Chat.SendButton", () => {
  it("has aria-label", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]}>
          <Chat.SendButton />
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByLabelText("Send message")).toBeDefined();
  });
});

describe("Chat.StopButton", () => {
  it("data-state is hidden when not streaming", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]}>
          <Chat.StopButton data-testid="stop" />
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("stop").dataset.state).toBe("hidden");
  });

  it("data-state is visible when streaming (controlled)", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]} isStreaming={true}>
          <Chat.StopButton data-testid="stop" />
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("stop").dataset.state).toBe("visible");
  });
});

describe("Parts outside Chat.Root", () => {
  it("Chat.Messages throws when used outside Chat.Root", () => {
    expect(() => {
      render(
        <Chat.Messages>{(msgs) => <div>{msgs.length}</div>}</Chat.Messages>,
      );
    }).toThrow("must be used within <Chat.Root>");
  });

  it("Chat.Input throws when used outside Chat.Root", () => {
    expect(() => {
      render(<Chat.Input />);
    }).toThrow("must be used within <Chat.Root>");
  });

  it("Chat.SendButton throws when used outside Chat.Root", () => {
    expect(() => {
      render(<Chat.SendButton />);
    }).toThrow("must be used within <Chat.Root>");
  });

  it("Chat.StopButton throws when used outside Chat.Root", () => {
    expect(() => {
      render(<Chat.StopButton />);
    }).toThrow("must be used within <Chat.Root>");
  });

  it("Chat.EmptyState throws when used outside Chat.Root", () => {
    expect(() => {
      render(<Chat.EmptyState>empty</Chat.EmptyState>);
    }).toThrow("must be used within <Chat.Root>");
  });

  it("Chat.MessageContent throws when used outside Chat.Message", () => {
    expect(() => {
      render(
        <Wrapper>
          <Chat.Root messages={[]}>
            <Chat.MessageContent />
          </Chat.Root>
        </Wrapper>,
      );
    }).toThrow("must be used within <Chat.Message.Root>");
  });
});

describe("className forwarding", () => {
  it("forwards className on Chat.Root", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]} className="custom" data-testid="root">
          <span />
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("root").classList.contains("custom")).toBe(true);
  });

  it("forwards className on Chat.Message", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[sampleMessage]}>
          <Chat.Message
            message={sampleMessage}
            className="custom"
            data-testid="message"
          />
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("message").classList.contains("custom")).toBe(
      true,
    );
  });

  it("forwards className on Chat.Input", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]}>
          <Chat.Input className="custom" data-testid="input" />
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("input").classList.contains("custom")).toBe(true);
  });

  it("forwards className on Chat.SendButton", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]}>
          <Chat.SendButton className="custom" data-testid="send" />
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("send").classList.contains("custom")).toBe(true);
  });

  it("forwards className on Chat.StopButton", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]}>
          <Chat.StopButton className="custom" data-testid="stop" />
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("stop").classList.contains("custom")).toBe(true);
  });

  it("forwards className on Chat.EmptyState", () => {
    render(
      <Wrapper>
        <Chat.Root messages={[]}>
          <Chat.EmptyState className="custom" data-testid="empty">
            empty
          </Chat.EmptyState>
        </Chat.Root>
      </Wrapper>,
    );
    expect(screen.getByTestId("empty").classList.contains("custom")).toBe(true);
  });
});
