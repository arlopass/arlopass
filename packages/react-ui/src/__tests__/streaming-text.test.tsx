"use client";

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StreamingText } from "../streaming-text/index.js";

describe("StreamingText", () => {
  it("renders content text", () => {
    render(
      <StreamingText content="Hello" isStreaming={false} data-testid="st" />,
    );
    expect(screen.getByTestId("st").textContent).toBe("Hello");
  });

  it("shows cursor when streaming", () => {
    render(
      <StreamingText content="Hello" isStreaming={true} data-testid="st" />,
    );
    expect(screen.getByTestId("st").textContent).toBe("Hello▌");
  });

  it("uses custom cursor", () => {
    render(
      <StreamingText
        content="Hi"
        isStreaming={true}
        cursor="|"
        data-testid="st"
      />,
    );
    expect(screen.getByTestId("st").textContent).toBe("Hi|");
  });

  it("hides cursor when not streaming", () => {
    render(
      <StreamingText content="Done" isStreaming={false} data-testid="st" />,
    );
    expect(screen.getByTestId("st").textContent).toBe("Done");
  });

  it("data-state='streaming' when streaming", () => {
    render(
      <StreamingText content="" isStreaming={true} data-testid="st" />,
    );
    expect(screen.getByTestId("st").dataset.state).toBe("streaming");
  });

  it("data-state='idle' when not streaming", () => {
    render(
      <StreamingText content="" isStreaming={false} data-testid="st" />,
    );
    expect(screen.getByTestId("st").dataset.state).toBe("idle");
  });

  it("forwards className", () => {
    render(
      <StreamingText
        content=""
        isStreaming={false}
        className="my-class"
        data-testid="st"
      />,
    );
    expect(screen.getByTestId("st").className).toBe("my-class");
  });
});
