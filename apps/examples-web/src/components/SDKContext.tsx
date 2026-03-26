import { createContext, useContext, useState, type ReactNode } from "react";

export type SDKOption = {
  id: string;
  label: string;
  language: string; // for syntax highlighting hint
};

export const AVAILABLE_SDKS: SDKOption[] = [
  { id: "web-sdk-ts", label: "TypeScript", language: "typescript" },
  // Future SDKs:
  // { id: "web-sdk-js", label: "JavaScript", language: "javascript" },
  // { id: "python-sdk", label: "Python", language: "python" },
  // { id: "node-sdk", label: "Node.js", language: "typescript" },
  // { id: "go-sdk", label: "Go", language: "go" },
  // { id: "rust-sdk", label: "Rust", language: "rust" },
  // { id: "curl", label: "cURL", language: "bash" },
];

type SDKContextValue = {
  activeSDK: string;
  setActiveSDK: (id: string) => void;
  sdks: SDKOption[];
};

const SDKContext = createContext<SDKContextValue>({
  activeSDK: "web-sdk-ts",
  setActiveSDK: () => {},
  sdks: AVAILABLE_SDKS,
});

export function SDKProvider({ children }: { children: ReactNode }) {
  const [activeSDK, setActiveSDK] = useState("web-sdk-ts");
  return (
    <SDKContext.Provider value={{ activeSDK, setActiveSDK, sdks: AVAILABLE_SDKS }}>
      {children}
    </SDKContext.Provider>
  );
}

export function useSDK() {
  return useContext(SDKContext);
}
