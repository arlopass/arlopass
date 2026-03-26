import { Box, ScrollArea, Text, TextInput, UnstyledButton } from "@mantine/core";
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
        items: cat.items.filter((item) =>
          item.label.toLowerCase().includes(lower),
        ),
      })).filter((cat) => cat.items.length > 0)
    : NAVIGATION;

  return (
    <>
      <Box px="sm" pb="sm" pt={4}>
        <TextInput
          placeholder="Search docs..."
          size="xs"
          leftSection={<IconSearch size={14} stroke={1.5} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          styles={{ input: { border: "1px solid var(--mantine-color-gray-3)" } }}
        />
      </Box>
      <ScrollArea type="scroll" scrollbarSize={6} style={{ flex: 1 }} px="sm">
        {filtered.map((cat, catIdx) => (
          <Box key={cat.label} mb={4} mt={catIdx === 0 ? 0 : 16}>
            <Text
              fz={11}
              fw={700}
              c="dimmed"
              tt="uppercase"
              lts={0.5}
              mb={6}
            >
              {cat.label}
            </Text>
            <Box
              style={{
                borderLeft: "1px solid var(--mantine-color-gray-3)",
              }}
            >
              {cat.items.map((item) => {
                const isActive = currentPage === item.id;
                return (
                  <UnstyledButton
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    display="block"
                    w="100%"
                    py={5}
                    px="sm"
                    fz="sm"
                    style={{
                      borderLeft: isActive
                        ? "2px solid var(--mantine-color-blue-6)"
                        : "2px solid transparent",
                      marginLeft: -1,
                      color: isActive
                        ? "var(--mantine-color-blue-6)"
                        : "var(--mantine-color-gray-7)",
                      fontWeight: isActive ? 500 : 400,
                      lineHeight: 1.5,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderLeftColor = "var(--mantine-color-gray-4)";
                        e.currentTarget.style.color = "var(--mantine-color-dark-9)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderLeftColor = "transparent";
                        e.currentTarget.style.color = "var(--mantine-color-gray-7)";
                      }
                    }}
                  >
                    {item.label}
                  </UnstyledButton>
                );
              })}
            </Box>
          </Box>
        ))}
      </ScrollArea>
    </>
  );
}
