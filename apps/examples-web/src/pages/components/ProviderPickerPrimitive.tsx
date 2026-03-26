import { Stack, Title, Text, Table, Code, Divider } from "@mantine/core";
import { CodeBlock, InlineCode, ApiTable } from "../../components";
import { navigate } from "../../router";

const parts = [
  { name: "Root", type: "div", description: "Manages provider/model selection state. Reads from useProviders when uncontrolled." },
  { name: "ProviderSelect", type: "select", description: "Dropdown for choosing an AI provider." },
  { name: "ModelSelect", type: "select", description: "Dropdown for choosing a model from the selected provider." },
  { name: "SubmitButton", type: "button", description: "Confirms the selected provider/model pair." },
];

const uncontrolledExample = `import { BYOMProvider } from "@byom-ai/react";
import { ProviderPicker } from "@byom-ai/react-ui";

function Picker() {
  return (
    <BYOMProvider>
      <ProviderPicker.Root>
        <ProviderPicker.ProviderSelect />
        <ProviderPicker.ModelSelect />
        <ProviderPicker.SubmitButton>Connect</ProviderPicker.SubmitButton>
      </ProviderPicker.Root>
    </BYOMProvider>
  );
}`;

const controlledExample = `import { useProviders } from "@byom-ai/react";
import { ProviderPicker } from "@byom-ai/react-ui";

function ControlledPicker() {
  const { providers, selectedProvider, selectProvider, isLoading, error } =
    useProviders();

  return (
    <ProviderPicker.Root
      providers={providers}
      selectedProvider={selectedProvider}
      isLoading={isLoading}
      error={error}
      onProviderChange={(id) => console.log("provider:", id)}
      onModelChange={(id) => console.log("model:", id)}
      onSelect={(providerId, modelId) =>
        selectProvider({ providerId, modelId })
      }
    >
      <ProviderPicker.ProviderSelect />
      <ProviderPicker.ModelSelect />
      <ProviderPicker.SubmitButton>Select</ProviderPicker.SubmitButton>
    </ProviderPicker.Root>
  );
}`;

const controlledRootProps = [
  { name: "providers", type: "readonly ProviderDescriptor[]", description: "List of available providers and their models." },
  { name: "selectedProvider", type: "{ providerId: string; modelId: string } | null", description: "Currently selected provider/model pair." },
  { name: "isLoading", type: "boolean", description: "True while fetching providers or selecting." },
  { name: "error", type: "BYOMSDKError | null", description: "Error from the last provider operation." },
  { name: "onProviderChange", type: "(providerId: string) => void", description: "Called when the user selects a different provider." },
  { name: "onModelChange", type: "(modelId: string) => void", description: "Called when the user selects a different model." },
  { name: "onSelect", type: "(providerId: string, modelId: string) => void", description: "Called when the user confirms the selection." },
];

const dataAttributes = [
  { name: "data-state", type: '"ready" | "loading" | "error"', default: '"ready"', description: "Set on ProviderPicker.Root. Reflects the current loading/error state." },
];

export default function ProviderPickerPrimitive() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>ProviderPicker</Title>
        <Text c="dimmed" mt={4}>
          Provider and model selection compound component
        </Text>
      </div>

      <CodeBlock code={`import { ProviderPicker } from "@byom-ai/react-ui";`} language="tsx" />

      <Title order={3}>Parts</Title>
      <Table withTableBorder withColumnBorders striped fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Element</Table.Th>
            <Table.Th>Purpose</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {parts.map((p) => (
            <Table.Tr key={p.name}>
              <Table.Td><Code fz="xs">ProviderPicker.{p.name}</Code></Table.Td>
              <Table.Td><Code fz="xs">{p.type}</Code></Table.Td>
              <Table.Td><Text fz="xs">{p.description}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Divider />
      <Title order={3}>Uncontrolled usage</Title>
      <Text>
        Inside a <InlineCode>{"<BYOMProvider>"}</InlineCode>,{" "}
        <InlineCode>ProviderPicker.Root</InlineCode> automatically reads from{" "}
        <InlineCode>useProviders</InlineCode>. No props needed.
      </Text>
      <CodeBlock title="Uncontrolled" code={uncontrolledExample} language="tsx" />

      <Divider />
      <Title order={3}>Controlled usage</Title>
      <Text>
        Pass props to take full control over the provider list and selection
        callbacks.
      </Text>
      <CodeBlock title="Controlled" code={controlledExample} language="tsx" />

      <Title order={3}>ProviderPicker.Root — controlled props</Title>
      <ApiTable data={controlledRootProps} />

      <Divider />
      <Title order={3}>Data attributes</Title>
      <ApiTable data={dataAttributes} />
    </Stack>
  );
}
