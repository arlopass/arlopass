import { Divider } from "@mantine/core";
import { tokens } from "./theme.js";

export function MetadataDivider() {
  return (
    <Divider
      orientation="vertical"
      size={1}
      color={tokens.color.border}
      aria-hidden="true"
      style={{ height: 12, alignSelf: "center" }}
    />
  );
}
