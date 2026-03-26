import { Table, Text, Code, Badge, Box } from "@mantine/core";

type ApiRow = {
  name: string;
  type: string;
  default?: string;
  description: string;
  required?: boolean;
};

type ApiTableProps = {
  data: ApiRow[];
  title?: string;
};

export function ApiTable({ data, title }: ApiTableProps) {
  return (
    <Box>
      {title && <Text fw={600} fz="sm" mb="xs">{title}</Text>}
      <Table striped highlightOnHover withTableBorder withColumnBorders fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Default</Table.Th>
            <Table.Th>Description</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((row) => (
            <Table.Tr key={row.name}>
              <Table.Td>
                <Code fz="xs">{row.name}</Code>
                {row.required && <Badge size="xs" color="red" ml={4}>required</Badge>}
              </Table.Td>
              <Table.Td><Code fz="xs" color="blue">{row.type}</Code></Table.Td>
              <Table.Td>{row.default ? <Code fz="xs">{row.default}</Code> : <Text c="dimmed" fz="xs">—</Text>}</Table.Td>
              <Table.Td><Text fz="xs">{row.description}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
