import { listCommand } from "./list.js";
import { addCommand } from "./add.js";

export function run(args: string[]): void {
  const command = args[0];
  if (command === "list") return listCommand();
  if (command === "add") return addCommand(args.slice(1));
  console.error(`Unknown command: ${command}. Use "list" or "add".`);
  process.exit(2);
}
