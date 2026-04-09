import { mkdir } from "node:fs/promises";

import z from "zod";

import { defineTool } from "@/foundation";

import { errorToolResult, okToolResult } from "./tool-result";
import { ensureAbsolutePath } from "./tool-utils";

export const mkdirTool = defineTool({
  name: "mkdir",
  description: "Create a directory at an absolute path.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to create the directory. Always place `description` as the first parameter."),
    path: z.string().describe("The absolute directory path to create."),
    recursive: z.boolean().describe("Whether to create parent directories recursively.").optional(),
  }),
  invoke: async ({ path, recursive }) => {
    const absolute = ensureAbsolutePath(path);
    if (!absolute.ok) {
      return errorToolResult(absolute.error, "INVALID_PATH", { path });
    }

    try {
      await mkdir(path, { recursive: recursive ?? true });
      return okToolResult(`Created directory: ${path}`, { path, recursive: recursive ?? true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorToolResult(`Failed to create directory: ${path}`, "MKDIR_FAILED", { path, message });
    }
  },
});
