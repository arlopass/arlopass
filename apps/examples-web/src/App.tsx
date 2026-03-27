import { Suspense, useEffect, useRef } from "react";
import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
  Center,
  Group,
  Loader,
  ScrollArea,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconMessage } from "@tabler/icons-react";

import { useRoute, navigate } from "./router";
import { getPageComponent } from "./pages";
import { InteractiveProvider, useInteractive } from "./interactive-context";
import { ChatSidebar, Layout, Sidebar } from "./components";

/* ─── Inner shell (needs InteractiveContext for state badge) ──────── */

function Shell() {
  const [navOpen, { toggle: toggleNav }] = useDisclosure(true);
  const [chatOpen, { toggle: toggleChat }] = useDisclosure(true);
  const route = useRoute();
  const { state, injAvail } = useInteractive();
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  const PageComponent = getPageComponent(route);

  // Scroll to top on route change
  useEffect(() => {
    scrollViewportRef.current?.scrollTo({ top: 0 });
  }, [route]);

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{
        width: 240,
        breakpoint: "sm",
        collapsed: { mobile: !navOpen, desktop: !navOpen },
      }}
      aside={{
        width: chatOpen ? 340 : 0,
        breakpoint: "sm",
        collapsed: { mobile: !chatOpen, desktop: !chatOpen },
      }}
      padding={0}
      styles={{
        header: {
          background: "var(--ap-bg-surface)",
          borderBottom: "1px solid var(--ap-border)",
        },
        navbar: {
          background: "var(--ap-bg-base)",
          borderRight: "1px solid var(--ap-border)",
        },
        main: { background: "var(--ap-bg-base)" },
        aside: {
          background: "var(--ap-bg-surface)",
          borderLeft: "1px solid var(--ap-border)",
        },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger
              opened={navOpen}
              onClick={toggleNav}
              size="sm"
              color="var(--ap-text-secondary)"
            />
            <img
              src="/ArlopassLogo-Dark.svg"
              height={24}
              style={{ height: 24 }}
              alt="Arlopass"
            />
            <Badge
              size="sm"
              variant="light"
              styles={{
                root: {
                  background:
                    state === "connected"
                      ? "var(--ap-success-subtle)"
                      : "var(--ap-bg-surface)",
                  color:
                    state === "connected"
                      ? "var(--ap-success)"
                      : "var(--ap-text-secondary)",
                  border: "none",
                },
              }}
            >
              {state}
            </Badge>
          </Group>
          <Group gap="xs">
            {injAvail && (
              <Badge
                size="xs"
                variant="dot"
                styles={{
                  root: {
                    color: "var(--ap-brand)",
                    "--badge-dot-color": "var(--ap-brand)",
                  },
                }}
              >
                Extension
              </Badge>
            )}
            <Tooltip label={chatOpen ? "Close chat" : "Open AI chat"}>
              <ActionIcon
                variant="subtle"
                onClick={toggleChat}
                size="lg"
                style={{ color: "var(--ap-text-secondary)" }}
              >
                <IconMessage size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Sidebar />
      </AppShell.Navbar>

      <AppShell.Main>
        <ScrollArea
          h="calc(100vh - 52px)"
          p="lg"
          type="scroll"
          viewportRef={scrollViewportRef}
        >
          <Box maw={800} mx="auto">
            <Suspense
              fallback={
                <Center h={200}>
                  <Loader />
                </Center>
              }
            >
              {PageComponent ? (
                <Layout pageId={route}>
                  <PageComponent />
                </Layout>
              ) : (
                <Center h={200}>
                  <Text c="dimmed">Page not found: {route}</Text>
                </Center>
              )}
            </Suspense>
          </Box>
        </ScrollArea>
      </AppShell.Main>

      {chatOpen && (
        <AppShell.Aside>
          <ChatSidebar onClose={toggleChat} onNavigate={navigate} />
        </AppShell.Aside>
      )}
    </AppShell>
  );
}

/* ─── App (top-level wrapper) ────────────────────────────────────── */

export default function App() {
  return (
    <InteractiveProvider>
      <Shell />
    </InteractiveProvider>
  );
}
