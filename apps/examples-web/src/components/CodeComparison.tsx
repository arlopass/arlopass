import { Tabs } from "@mantine/core";
import { CodeBlock } from "./CodeBlock";
import { IconBrandReact, IconBrandTypescript } from "@tabler/icons-react";

type CodeComparisonProps = {
  webSdk: { title: string; code: string };
  reactSdk: { title: string; code: string };
};

export function CodeComparison({ webSdk, reactSdk }: CodeComparisonProps) {
  return (
    <Tabs
      defaultValue="react"
      variant="outline"
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <Tabs.List>
        <Tabs.Tab value="react" className="language-tab">
          <IconBrandReact color="#61DBFB" size={14} stroke={1.5} /> React SDK
        </Tabs.Tab>
        <Tabs.Tab value="web" className="language-tab">
          <IconBrandTypescript color="#007acc" size={14} stroke={1.5} />
          Web SDK
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="react">
        <CodeBlock title={reactSdk.title} code={reactSdk.code} inPreview />
      </Tabs.Panel>
      <Tabs.Panel value="web">
        <CodeBlock title={webSdk.title} code={webSdk.code} inPreview />
      </Tabs.Panel>
    </Tabs>
  );
}
