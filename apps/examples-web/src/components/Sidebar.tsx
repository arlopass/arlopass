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
          styles={{
            input: {
              background: "var(--ap-bg-surface)",
              border: "1px solid var(--ap-border)",
              color: "var(--ap-text-body)",
              "&::placeholder": { color: "var(--ap-text-tertiary)" },
            },
          }}
        />
      </Box>
      <ScrollArea type="scroll" scrollbarSize={6} style={{ flex: 1 }} px="sm">
        {filtered.map((cat, catIdx) => (
          <Box key={cat.label} mb={4} mt={catIdx === 0 ? 0 : 16}>
            <Text
              fz={11}
              fw={700}
              tt="uppercase"
              lts={0.5}
              mb={6}
              style={{ color: "var(--ap-text-tertiary)", letterSpacing: "0.05em" }}
            >
              {cat.label}
            </Text>
            <Box
              style={{
                borderLeft: "1px solid var(--ap-border)",
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
                        ? "2px solid var(--ap-brand)"
                        : "2px solid transparent",
                      marginLeft: -1,
                      color: isActive
                        ? "var(--ap-text-primary)"
                        : "var(--ap-text-secondary)",
                      fontWeight: isActive ? 500 : 400,
                      lineHeight: 1.5,
                      background: isActive ? "var(--ap-brand-subtle-dark)" : "transparent",
                      borderRadius: "0 var(--ap-radius-sm) var(--ap-radius-sm) 0",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "var(--ap-bg-surface)";
                        e.currentTarget.style.color = "var(--ap-text-primary)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--ap-text-secondary)";
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
