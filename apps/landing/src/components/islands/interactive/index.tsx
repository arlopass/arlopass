import { InteractiveApp } from "./InteractiveApp";
import PlaygroundPage from "./Playground";
import ConnectionPanelPage from "./ConnectionPanel";
import ProviderExplorerPage from "./ProviderExplorer";
import ChatTranscriptPage from "./ChatTranscript";
import StreamingDemoPage from "./StreamingDemo";
import EventLogPage from "./EventLog";

export function Playground() {
  return (
    <InteractiveApp>
      <PlaygroundPage />
    </InteractiveApp>
  );
}
export function ConnectionPanel() {
  return (
    <InteractiveApp>
      <ConnectionPanelPage />
    </InteractiveApp>
  );
}
export function ProviderExplorer() {
  return (
    <InteractiveApp>
      <ProviderExplorerPage />
    </InteractiveApp>
  );
}
export function ChatTranscript() {
  return (
    <InteractiveApp>
      <ChatTranscriptPage />
    </InteractiveApp>
  );
}
export function StreamingDemo() {
  return (
    <InteractiveApp>
      <StreamingDemoPage />
    </InteractiveApp>
  );
}
export function EventLog() {
  return (
    <InteractiveApp>
      <EventLogPage />
    </InteractiveApp>
  );
}
