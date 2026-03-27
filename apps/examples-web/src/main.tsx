import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import App from "./App";
import { SDKProvider } from "./components";
import "./styles.css";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

const arlopassTheme = createTheme({
  fontFamily: "'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontFamilyMonospace: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  primaryColor: "brand",
  defaultRadius: "sm",
  colors: {
    brand: [
      '#FFF7ED',
      '#FFEDD5',
      '#FED7AA',
      '#FDBA74',
      '#FB923C',
      '#F97316',
      '#EA580C',
      '#C2410C',
      '#9A3412',
      '#7C2D12',
    ],
  },
  fontSizes: {
    xs: '12px',
    sm: '14px',
    md: '16px',
    lg: '18px',
    xl: '20px',
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={arlopassTheme} defaultColorScheme="dark">
      <SDKProvider>
        <Notifications position="top-right" />
        <App />
      </SDKProvider>
    </MantineProvider>
  </React.StrictMode>,
);

