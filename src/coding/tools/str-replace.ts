import z from "zod";

import { defineTool } from "@/foundation";

import { errorToolResult, okToolResult } from "./tool-result";
import { ensureAbsolutePath } from "./tool-utils";

export const strReplaceTool = defineTool({
  name: "str_replace",
  description: "Replace occurrences of a substring in a file. Make sure the `old` is unique in the file.",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to perform this replacement. Always place `description` as the first parameter."),
    path: z.string().describe("The absolute path to the file to operate on."),
    old: z.string().describe("The substring to replace."),
    new: z.string().describe("The substring to be replaced with."),
    count: z
      .number()
      .int()
      .nonnegative()
      .describe("Maximum number of replacements. Omit to replace all occurrences.")
      .optional(),
  }),
  invoke: async ({ path, old, new: replacement, count }) => {
    const absolute = ensureAbsolutePath(path);
    if (!absolute.ok) {
      return errorToolResult(absolute.error, "INVALID_PATH", { path });
    }

    const file = Bun.file(path);
    if (!(await file.exists())) {
      return errorToolResult(`File ${path} does not exist.`, "FILE_NOT_FOUND", { path });
    }

    if (old.length === 0) {
      return errorToolResult("`old` must be a non-empty string.", "INVALID_ARGUMENT", { path });
    }

    const text = await file.text();

    const maxReplacements = count ?? Number.POSITIVE_INFINITY;
    if (maxReplacements === 0) {
      return okToolResult(`No replacements requested (count=0) in ${path}`, {
        path,
        replacements: 0,
        changed: false,
      });
    }

    // Count actual occurrences up to the limit
    let replacements = 0;
    let idx = 0;
    while (replacements < maxReplacements) {
      const next = text.indexOf(old, idx);
      if (next === -1) break;
      replacements++;
      idx = next + old.length;
    }

    if (replacements === 0) {
      return errorToolResult(`No occurrences of 'old' found in ${path}.`, "NOT_FOUND", { path });
    }

    let updated: string;
    if (count === undefined) {
      updated = text.split(old).join(replacement);
    } else {
      let remaining = count;
      updated = text.replaceAll(old, (match) => {
        if (remaining <= 0) return match;
        remaining--;
        return replacement;
      });
    }

    if (updated === text) {
      return okToolResult(`No effective changes in ${path}`, {
        path,
        replacements: 0,
        changed: false,
      });
    }

    try {
      await file.write(updated);
      return okToolResult(`Replaced ${replacements} occurrence(s) in ${path}`, {
        path,
        replacements,
        changed: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorToolResult(`Failed to write replacement to ${path}`, "WRITE_FAILED", { path, message });
    }
  },
});
