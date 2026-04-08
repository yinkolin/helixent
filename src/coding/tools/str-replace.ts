import { exists, mkdir } from "node:fs/promises";
import { parse } from "node:path";

import z from "zod";

import { defineTool } from "@/foundation";

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
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return { ok: false as const, error: `File ${path} does not exist.` };
    }

    if (old.length === 0) {
      return { ok: false as const, error: "`old` must be a non-empty string." };
    }

    const text = await file.text();

    const maxReplacements = count ?? Number.POSITIVE_INFINITY;
    if (maxReplacements === 0) {
      return { ok: true as const, path, replacements: 0, changed: false as const };
    }

    let replacements = 0;
    let idx = 0;
    while (replacements < maxReplacements) {
      const next = text.indexOf(old, idx);
      if (next === -1) break;
      replacements++;
      idx = next + old.length;
    }

    if (replacements === 0) {
      return { ok: false as const, error: `No occurrences of 'old' found in ${path}.` };
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
      return { ok: true as const, path, replacements: 0, changed: false as const };
    }

    // Make sure the parent directory exists
    const parentDir = parse(path).dir;
    if (!(await exists(parentDir))) {
      await mkdir(parentDir, { recursive: true });
    }

    await file.write(updated);
    return { ok: true as const, path, replacements, changed: true as const };
  },
});
