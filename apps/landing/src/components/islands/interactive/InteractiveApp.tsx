import { MantineProvider, createTheme } from "@mantine/core";
import { InteractiveProvider } from "../InteractiveContext";

const theme = createTheme({
  primaryColor: "brand",
  defaultRadius: "sm",
  colors: {
    brand: [
      "#FFF7ED", "#FFEDD5", "#FED7AA", "#FDBA74", "#FB923C",
      "#F97316", "#EA580C", "#DB4D12", "#9A3412", "#7C2D12",
    ],
  },
});

export function InteractiveApp({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <InteractiveProvider>
        {children}
      </InteractiveProvider>
    </MantineProvider>
  );
}
