import { MantineProvider, createTheme } from "@mantine/core";
import { InteractiveProvider } from "../InteractiveContext";

// Import individual component CSS (layer versions) — does NOT bleed globals.
import "@mantine/core/styles/global.layer.css";
import "@mantine/core/styles/default-css-variables.layer.css";
import "@mantine/core/styles/Stack.layer.css";
import "@mantine/core/styles/Title.layer.css";
import "@mantine/core/styles/Text.layer.css";
import "@mantine/core/styles/Button.layer.css";
import "@mantine/core/styles/Card.layer.css";
import "@mantine/core/styles/Badge.layer.css";
import "@mantine/core/styles/Group.layer.css";
import "@mantine/core/styles/Alert.layer.css";
import "@mantine/core/styles/Code.layer.css";
import "@mantine/core/styles/Combobox.layer.css";
import "@mantine/core/styles/Input.layer.css";
import "@mantine/core/styles/ScrollArea.layer.css";
import "@mantine/core/styles/Loader.layer.css";
import "@mantine/core/styles/Divider.layer.css";
import "@mantine/core/styles/SegmentedControl.layer.css";
import "@mantine/core/styles/UnstyledButton.layer.css";
import "@mantine/core/styles/CloseButton.layer.css";

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
