import z from "zod";

import { defineTool } from "@/foundation";

export const bashTool = defineTool({
  name: "bash",
  description: "Execute a bash command in a unix-like environment",
  parameters: z.object({
    description: z
      .string()
      .describe("Explain why you want to execute the command. Always place `description` as the first parameter."),
    command: z.string().describe("The bash command to execute."),
  }),
  invoke: async ({ command }, signal) => {
    // Execute the command and return the standard output or standard error
    const proc = Bun.spawn({
      cmd: ["zsh", "-c", command],
      stdout: "pipe",
      stderr: "pipe",
    });

    if (signal) {
      const onAbort = () => proc.kill();
      signal.addEventListener("abort", onAbort, { once: true });
      void proc.exited.then(() => signal.removeEventListener("abort", onAbort));
    }

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return `Error: Command ${command} failed with exit code ${exitCode}: ${stderr}`;
    }
    return output;
  },
});
