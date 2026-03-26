import { Box, Paper } from "@mantine/core";
import type { ReactNode } from "react";
import { tokens } from "./theme.js";

export type PopupShellProps = {
  children: ReactNode;
};

export function PopupShell({ children }: PopupShellProps) {
  return (
    <Box
      style={{
        width: tokens.size.popupWidth,
        minWidth: tokens.size.popupWidth,
        maxWidth: tokens.size.popupWidth,
        height: "100vh",
        maxHeight: "100vh",
        background: tokens.color.bgSurface,
        padding: tokens.spacing.outerPadding,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <Paper
        radius={tokens.radius.container}
        shadow="none"
        style={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {children}
      </Paper>
    </Box>
  );
}
