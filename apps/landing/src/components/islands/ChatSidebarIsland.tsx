import { useEffect, useState, lazy, Suspense } from "react";

// Lazy-load the entire ChatSidebar tree (React + Mantine + SDK) only when opened.
// This means zero JS/CSS cost on pages where the user doesn't click the chat button.
const LazyChatPanel = lazy(() => import("./ChatSidebarPanel"));

const OPEN_KEY = "arlopass.chat.open";

export default function ChatSidebarIsland() {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* SSR or private browsing */
    }
  }, [open]);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    document.addEventListener("toggle-chat", handler);
    return () => document.removeEventListener("toggle-chat", handler);
  }, []);

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <LazyChatPanel onClose={() => setOpen(false)} />
    </Suspense>
  );
}
