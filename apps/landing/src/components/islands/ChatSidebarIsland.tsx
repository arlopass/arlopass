import { useEffect, useState, lazy, Suspense } from "react";

// Lazy-load the entire ChatSidebar tree (React + Mantine + SDK) only when opened.
// This means zero JS/CSS cost on pages where the user doesn't click the chat button.
const LazyChatPanel = lazy(() => import("./ChatSidebarPanel"));

export default function ChatSidebarIsland() {
  const [open, setOpen] = useState(false);

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
