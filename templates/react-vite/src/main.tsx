import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ArlopassProvider } from "@arlopass/react";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ArlopassProvider appName="Arlopass Starter" autoConnect>
      <App />
    </ArlopassProvider>
  </StrictMode>,
);
