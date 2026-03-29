import { MantineProvider, createTheme } from "@mantine/core";
import { InteractiveProvider } from "../InteractiveContext";

// Import Mantine CSS inside the interactive island — only loads on interactive pages.
import "@mantine/core/styles.css";

const theme = createTheme({
  primaryColor: "brand",
  defaultRadius: "sm",
  cssVariablesSelector: "#arlopass-interactive",
  colors: {
    brand: [
      "#FFF7ED",
      "#FFEDD5",
      "#FED7AA",
      "#FDBA74",
      "#FB923C",
      "#F97316",
      "#EA580C",
      "#DB4D12",
      "#9A3412",
      "#7C2D12",
    ],
  },
});

export function InteractiveApp({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      getRootElement={() =>
        document.getElementById("arlopass-interactive") || document.body
      }
    >
      <div id="arlopass-interactive" data-mantine-color-scheme="dark">
        <InteractiveProvider>{children}</InteractiveProvider>
      </div>
    </MantineProvider>
  );
}
