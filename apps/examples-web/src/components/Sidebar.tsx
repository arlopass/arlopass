import { Box, Kbd, ScrollArea, Text, UnstyledButton } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { NAVIGATION } from "../navigation";
import { navigate, useRoute } from "../router";
import { spotlight } from "./DocsSpotlight";

export function Sidebar() {
  const currentPage = useRoute();

  return (
    <>
      <Box px="sm" pb="sm" pt={4}>
        <UnstyledButton
          onClick={() => spotlight.open()}
          w="100%"
          px="xs"
          py={6}
          fz="xs"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--ap-bg-surface)",
            border: "1px solid var(--ap-border)",
            borderRadius: "var(--ap-radius-sm)",
            color: "var(--ap-text-tertiary)",
          }}
        >
          <IconSearch size={14} stroke={1.5} />
          <span style={{ flex: 1 }}>Search docs...</span>
          <Kbd size="xs" style={{ fontSize: 10 }}>
            Ctrl + K
          </Kbd>
        </UnstyledButton>
      </Box>
      <ScrollArea type="scroll" scrollbarSize={6} style={{ flex: 1 }} px="sm">
        {NAVIGATION.map((cat, catIdx) => (
          <Box key={cat.label} mb={4} mt={catIdx === 0 ? 0 : 16}>
            <Text
              fz={11}
              fw={700}
              tt="uppercase"
              lts={0.5}
              mb={6}
              style={{
                color: "var(--ap-text-tertiary)",
                letterSpacing: "0.05em",
              }}
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
                      background: isActive
                        ? "var(--ap-brand-subtle-dark)"
                        : "transparent",
                      borderRadius:
                        "0 var(--ap-radius-sm) var(--ap-radius-sm) 0",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background =
                          "var(--ap-bg-surface)";
                        e.currentTarget.style.color = "var(--ap-text-primary)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color =
                          "var(--ap-text-secondary)";
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
