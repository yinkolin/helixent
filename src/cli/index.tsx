import { join } from "node:path";

import { Command } from "commander";
import { render } from "ink";

import { globalApprovalManager } from "@/agent/approval";
import { validateIntegrity } from "@/cli/bootstrap";
import { registerCommands } from "@/cli/commands";
import { loadConfig } from "@/cli/config";
import { createCodingAgent } from "@/coding";
import { OpenAIModelProvider } from "@/community/openai";
import { Model } from "@/foundation";

import { App } from "./tui";
import { loadAvailableCommands, type SlashCommand } from "./tui/command-registry";
import { AgentLoopProvider } from "./tui/hooks/use-agent-loop";
import { HELIXENT_NAME, HELIXENT_VERSION } from "./version";

const program = new Command();
program
  .name(HELIXENT_NAME)
  .description("Helixent — a blue rabbit that writes code")
  .version(HELIXENT_VERSION, "-v, --version");

registerCommands(program);

const args = process.argv.slice(2);

if (args.length > 0) {
  await program.parseAsync(process.argv);
} else {
  console.info();
  await validateIntegrity();

  const config = loadConfig();
  const defaultModelName = config.defaultModel ?? config.models[0]?.name;
  const entry = defaultModelName ? config.models.find((m) => m.name === defaultModelName) : undefined;
  if (!entry) {
    throw new Error("No models configured. Run `helixent config model add` to add one.");
  }

  const provider = new OpenAIModelProvider({
    baseURL: entry.baseURL,
    apiKey: entry.APIKey,
  });

  const model = new Model(entry.name, provider, {
    max_tokens: 16 * 1024,
    thinking: {
      type: "enabled",
    },
  });

  const skillsDirs = [
    join(process.cwd(), "skills"),
    join(process.cwd(), ".agents/skills"),
    join(process.cwd(), ".helixent/skills"),
    "~/.agents/skills",
    "~/.helixent/skills",
  ];

  const agent = await createCodingAgent({
    model,
    skillsDirs,
    askUser: globalApprovalManager.askUser,
  });
  const commands: SlashCommand[] = await loadAvailableCommands(skillsDirs);

  render(
    <AgentLoopProvider agent={agent}>
      <App commands={commands} />
    </AgentLoopProvider>,
    { patchConsole: false },
  );
}
