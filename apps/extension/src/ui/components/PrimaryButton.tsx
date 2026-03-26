import { Button } from "@mantine/core";
import { tokens } from "./theme.js";

export type PrimaryButtonProps = {
  children: string;
  onClick?: (() => void) | undefined;
  disabled?: boolean | undefined;
};

export function PrimaryButton({ children, onClick, disabled }: PrimaryButtonProps) {
  return (
    <Button
      onClick={onClick}
      fullWidth
      radius={tokens.radius.button}
      color={tokens.color.btnPrimaryBg}
      fz="md"
      fw={500}
      disabled={disabled === true}
      styles={{
        root: {
          height: "auto",
          padding: `${tokens.spacing.buttonPaddingY}px 0`,
          "&:disabled": {
            backgroundColor: "#c0c0c0",
            color: "#f3f3f3",
          },
        },
      }}
    >
      {children}
    </Button>
  );
}
