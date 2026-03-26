import { Tabs } from "@mantine/core";
import { CodeBlock } from "./CodeBlock";

type CodeComparisonProps = {
  webSdk: { title: string; code: string };
  reactSdk: { title: string; code: string };
};

export function CodeComparison({ webSdk, reactSdk }: CodeComparisonProps) {
  return (
    <Tabs defaultValue="react" variant="outline">
      <Tabs.List>
        <Tabs.Tab value="react">React SDK</Tabs.Tab>
        <Tabs.Tab value="web">Web SDK</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="react" pt="xs">
        <CodeBlock title={reactSdk.title} code={reactSdk.code} />
      </Tabs.Panel>
      <Tabs.Panel value="web" pt="xs">
        <CodeBlock title={webSdk.title} code={webSdk.code} />
      </Tabs.Panel>
    </Tabs>
  );
}
