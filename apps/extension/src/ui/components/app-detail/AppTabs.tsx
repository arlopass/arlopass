import { useRef, useState, useEffect } from "react";

export type AppTabId = "providers" | "models" | "settings";

export type AppTabsProps = {
  activeTab: AppTabId;
  onTabChange: (tab: AppTabId) => void;
};

const tabItems: { id: AppTabId; label: string }[] = [
  { id: "providers", label: "Providers" },
  { id: "models", label: "Models" },
  { id: "settings", label: "Settings" },
];

export function AppTabs({ activeTab, onTabChange }: AppTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (!tabsRef.current) return;
    const activeButton = tabsRef.current.querySelector(
      `[data-tab="${activeTab}"]`,
    ) as HTMLElement | null;
    if (activeButton) {
      const containerRect = tabsRef.current.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      setIndicator({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
      });
    }
  }, [activeTab]);

  return (
    <div
      ref={tabsRef}
      className="relative flex w-full border-b border-[var(--ap-border)]"
    >
      {tabItems.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-tab={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex items-center justify-center py-1.5 bg-transparent border-none cursor-pointer text-[10px]! font-medium whitespace-nowrap transition-colors duration-200
            ${tab.id === activeTab ? "text-[var(--ap-text-primary)]" : "text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-body)]"}`}
        >
          {tab.label}
        </button>
      ))}
      <div
        className="absolute bottom-0 h-[2px] bg-[var(--ap-text-primary)] rounded-full transition-all duration-250"
        style={{
          left: indicator.left,
          width: indicator.width,
          transitionTimingFunction: "cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      />
    </div>
  );
}
