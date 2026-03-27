"use client";

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { ArlopassProvider } from "@arlopass/react";
import { ConnectionStatus } from "../connection-status/index.js";

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

describe("ConnectionStatus", () => {
  it("renders with controlled state prop", () => {
    render(
      <Wrapper>
        <ConnectionStatus state="connected" data-testid="conn" />
      </Wrapper>,
    );
    const el = screen.getByTestId("conn");
    expect(el.dataset.state).toBe("connected");
    expect(el.textContent).toBe("connected");
  });

  it("renders children when provided", () => {
    render(
      <Wrapper>
        <ConnectionStatus state="disconnected" data-testid="conn">
          <span>Custom</span>
        </ConnectionStatus>
      </Wrapper>,
    );
    expect(screen.getByTestId("conn").textContent).toBe("Custom");
  });

  it("data-state reflects controlled state", () => {
    render(
      <Wrapper>
        <ConnectionStatus state="connecting" data-testid="conn" />
      </Wrapper>,
    );
    expect(screen.getByTestId("conn").dataset.state).toBe("connecting");
  });

  it("forwards className", () => {
    render(
      <Wrapper>
        <ConnectionStatus
          state="connected"
          className="my-class"
          data-testid="conn"
        />
      </Wrapper>,
    );
    expect(screen.getByTestId("conn").className).toBe("my-class");
  });

  it("renders in uncontrolled mode inside ArlopassProvider", () => {
    render(
      <Wrapper>
        <ConnectionStatus data-testid="conn" />
      </Wrapper>,
    );
    const el = screen.getByTestId("conn");
    expect(el.dataset.state).toBeDefined();
  });
});
