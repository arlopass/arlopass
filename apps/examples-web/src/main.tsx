import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import App from "./App";
import { SDKProvider } from "./components";
import "./styles.css";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="light">
      <SDKProvider>
        <Notifications position="top-right" />
        <App />
      </SDKProvider>
    </MantineProvider>
  </React.StrictMode>,
);

