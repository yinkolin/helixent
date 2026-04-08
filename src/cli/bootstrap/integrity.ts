import {
  ensureHelixentHomeDirectory,
  getConfigFilePath,
  getDefaultHelixentHome,
  isHelixentSetupComplete,
  saveConfig,
} from "@/cli/config";

import { runFirstRunWizard } from "./first-run-wizard";

function ensureHelixentHomeEnv(): void {
  if (!process.env.HELIXENT_HOME?.trim()) {
    const p = getDefaultHelixentHome();
    process.env.HELIXENT_HOME = p;
    if (typeof Bun !== "undefined") {
      Bun.env.HELIXENT_HOME = p;
    }
  }
}

export async function validateIntegrity(): Promise<void> {
  ensureHelixentHomeEnv();
  if (isHelixentSetupComplete()) {
    return;
  }
  ensureHelixentHomeDirectory();
  try {
    const config = await runFirstRunWizard();
    saveConfig(config);
    console.info(`\n\nHelixent setup completed. Config saved to: ${getConfigFilePath()}\n\n`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
