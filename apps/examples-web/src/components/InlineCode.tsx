import { Code } from "@mantine/core";
import type { ReactNode } from "react";

export type InlineCodeProps = {
  children: ReactNode;
};

/** Styled inline code span matching our doc design. */
export function InlineCode({ children }: InlineCodeProps) {
  return (
    <Code
      style={{
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: "0.875em",
        fontWeight: 500,
      }}
    >
      {children}
    </Code>
  );
}
