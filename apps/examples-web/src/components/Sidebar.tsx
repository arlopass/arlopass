import { Box, NavLink, ScrollArea, Text, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { NAVIGATION } from "../navigation";
import { navigate, useRoute } from "../router";

export function Sidebar() {
  const currentPage = useRoute();
  const [search, setSearch] = useState("");
  const lower = search.toLowerCase();

  const filtered = search.trim()
    ? NAVIGATION.map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.label.toLowerCase().includes(lower) ||
            (item.description?.toLowerCase().includes(lower) ?? false),
        ),
      })).filter((cat) => cat.items.length > 0)
    : NAVIGATION;

  return (
    <>
      <Box px="xs" pb="xs">
        <TextInput
          placeholder="Search docs..."
          size="xs"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </Box>
      <ScrollArea type="scroll" scrollbarSize={6} style={{ flex: 1 }}>
        {filtered.map((cat) => (
          <Box key={cat.label} mb="xs">
            <Text fz="xs" fw={700} c="dimmed" tt="uppercase" mb={4} px="xs">
              {cat.icon} {cat.label}
            </Text>
            {cat.items.map((item) => (
              <NavLink
                key={item.id}
                label={item.label}
                description={item.description}
                active={currentPage === item.id}
                onClick={() => navigate(item.id)}
                variant="light"
                fz="sm"
                py={6}
              />
            ))}
          </Box>
        ))}
      </ScrollArea>
    </>
  );
}
