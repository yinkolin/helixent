import { rename } from "node:fs/promises";

import z from "zod";

import { defineTool } from "@/foundation";

import { errorToolResult, okToolResult } from "./tool-result";
import { ensureAbsolutePath } from "./tool-utils";

export const movePathTool = defineTool({
  name: "move_path",
  description: "Move or rename a file or directory between absolute paths.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to move the path. Always place `description` as the first parameter."),
    from: z.string().describe("The absolute source path."),
    to: z.string().describe("The absolute target path."),
  }),
  invoke: async ({ from, to }) => {
    const source = ensureAbsolutePath(from);
    if (!source.ok) {
      return errorToolResult(source.error, "INVALID_SOURCE_PATH", { from, to });
    }

    const target = ensureAbsolutePath(to);
    if (!target.ok) {
      return errorToolResult(target.error, "INVALID_TARGET_PATH", { from, to });
    }

    try {
      await rename(from, to);
      return okToolResult(`Moved path from ${from} to ${to}`, { from, to });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorToolResult(`Failed to move path from ${from} to ${to}`, "MOVE_FAILED", { from, to, message });
    }
  },
});
