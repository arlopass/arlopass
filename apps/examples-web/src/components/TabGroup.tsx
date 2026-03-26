import { useState, type ReactNode } from "react";
import { Box, Tabs } from "@mantine/core";

export type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
};

export type TabGroupProps = {
  tabs: TabItem[];
  defaultTab?: string;
};

/**
 * Horizontal tab group for switching between operation variants
 * (e.g. Create / Update / Delete / Retrieve / List / Search).
 */
export function TabGroup({ tabs, defaultTab }: TabGroupProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id ?? "");

  return (
    <Box>
      <Tabs value={active} onChange={(v) => v && setActive(v)} variant="default">
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.id} value={tab.id} fz="sm" >
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Panel key={tab.id} value={tab.id} pt="md">
            {tab.content}
          </Tabs.Panel>
        ))}
      </Tabs>
    </Box>
  );
}
