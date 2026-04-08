import { Box, render, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

import type { HelixentConfig } from "@/cli/config";

type Step = "welcome" | "provider" | "apiKey" | "modelName" | "baseURL" | "confirm";

type ProviderId = "openai" | "volcengine" | "volcengine_coding_plan" | "deepseek" | "other";

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "openai", label: "OpenAI" },
  { id: "volcengine", label: "Volcengine - General" },
  { id: "volcengine_coding_plan", label: "Volcengine - Coding Plan" },
  { id: "deepseek", label: "DeepSeek (OpenAI compatible)" },
  { id: "other", label: "Other" },
];

const PRESET_BASE_URL: Record<Exclude<ProviderId, "other">, string> = {
  openai: "https://api.openai.com/v1",
  volcengine: "https://ark.cn-beijing.volces.com/api/v3",
  volcengine_coding_plan: "https://ark.cn-beijing.volces.com/api/coding/v3",
  deepseek: "https://api.deepseek.com/v1",
};

function buildConfig(providerId: ProviderId, apiKey: string, modelName: string, customBaseURL: string): HelixentConfig {
  const baseURL = providerId === "other" ? customBaseURL.trim() : PRESET_BASE_URL[providerId];
  return {
    models: [
      {
        name: modelName.trim(),
        baseURL,
        APIKey: apiKey.trim(),
      },
    ],
  };
}

type FirstRunWizardProps = {
  // Parameter name documents the callback argument; not referenced in type-only position.
  // eslint-disable-next-line no-unused-vars -- callback arg name in function type
  onComplete: (config: HelixentConfig) => void;
  onAbort: () => void;
};

function FirstRunWizard({ onComplete, onAbort }: FirstRunWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [providerIndex, setProviderIndex] = useState(0);
  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [customBaseURL, setCustomBaseURL] = useState("");
  const [pendingConfig, setPendingConfig] = useState<HelixentConfig | null>(null);

  const resetWizard = () => {
    setStep("welcome");
    setProviderIndex(0);
    setProviderId("openai");
    setApiKey("");
    setModelName("");
    setCustomBaseURL("");
    setPendingConfig(null);
  };

  const activeNav = step === "welcome" || step === "provider";
  const textSteps = step === "apiKey" || step === "modelName" || step === "baseURL";

  useInput(
    (_input, key) => {
      if (key.escape && textSteps) {
        onAbort();
      }
    },
    { isActive: textSteps },
  );

  useInput(
    (_input, key) => {
      if (step === "welcome") {
        if (key.return) {
          setStep("provider");
        }
        if (key.escape) {
          onAbort();
        }
        return;
      }
      if (step === "provider") {
        if (key.upArrow) {
          setProviderIndex((i) => (i > 0 ? i - 1 : PROVIDERS.length - 1));
        }
        if (key.downArrow) {
          setProviderIndex((i) => (i < PROVIDERS.length - 1 ? i + 1 : 0));
        }
        if (key.return) {
          const id = PROVIDERS[providerIndex]?.id ?? "openai";
          setProviderId(id);
          setStep("apiKey");
        }
        if (key.escape) {
          onAbort();
        }
      }
    },
    { isActive: activeNav },
  );

  const finishWithBaseURL = (url: string) => {
    setCustomBaseURL(url);
    const cfg = buildConfig(providerId, apiKey, modelName, url);
    setPendingConfig(cfg);
    setStep("confirm");
  };

  const goFromModelName = () => {
    if (providerId === "other") {
      setStep("baseURL");
    } else {
      const cfg = buildConfig(providerId, apiKey, modelName, "");
      setPendingConfig(cfg);
      setStep("confirm");
    }
  };

  useInput(
    (input, key) => {
      if (step !== "confirm") {
        return;
      }
      if (key.return) {
        if (pendingConfig) {
          onComplete(pendingConfig);
        }
        return;
      }
      if (key.escape || input === "n" || input === "N") {
        resetWizard();
      }
    },
    { isActive: step === "confirm" },
  );

  if (step === "welcome") {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text bold color="cyan">
          Welcome to Helixent
        </Text>
        <Text>
          First run setup: choose a provider, enter your API key, and pick a model name. Press Enter to continue, or Esc
          to quit.
        </Text>
      </Box>
    );
  }

  if (step === "provider") {
    return (
      <Box flexDirection="column">
        <Text bold>Select a model provider (↑/↓ to move, Enter to confirm)</Text>
        {PROVIDERS.map((p, i) => (
          <Text key={p.id} color={i === providerIndex ? "cyan" : undefined}>
            {i === providerIndex ? "❯ " : "  "}
            {p.label}
          </Text>
        ))}
      </Box>
    );
  }

  if (step === "apiKey") {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text>
          Provider: {PROVIDERS[providerIndex]?.label} (
          {providerId === "other" ? "custom baseURL" : PRESET_BASE_URL[providerId as keyof typeof PRESET_BASE_URL]})
        </Text>
        <Text bold>Enter your API key</Text>
        <Box>
          <Text>API Key: </Text>
          <TextInput mask="*" value={apiKey} onChange={setApiKey} onSubmit={() => setStep("modelName")} />
        </Box>
        <Text dimColor>Press Enter to continue (Esc to cancel)</Text>
      </Box>
    );
  }

  if (step === "modelName") {
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text bold>Enter a model name</Text>
        <Box>
          <Text>Model: </Text>
          <TextInput
            value={modelName}
            placeholder="e.g. doubao-seed-2.0-code"
            onChange={setModelName}
            onSubmit={goFromModelName}
          />
        </Box>
        <Text dimColor>Press Enter to continue (Esc to cancel)</Text>
      </Box>
    );
  }

  if (step === "confirm") {
    const cfg = pendingConfig?.models?.[0];
    const providerLabel = PROVIDERS.find((p) => p.id === providerId)?.label ?? providerId;
    if (!cfg) {
      return (
        <Box flexDirection="column">
          <Text color="red">No pending config. Restarting…</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" rowGap={1}>
        <Text bold color="cyan">
          Last confirmation
        </Text>
        <Text>Provider: {providerLabel}</Text>
        <Text>Model: {cfg.name}</Text>
        <Text>baseURL: {cfg.baseURL}</Text>
        <Text>API Key: {maskSecurityString(cfg.APIKey)}</Text>
        <Text dimColor>Enter to confirm (n 或 Esc 重来)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" rowGap={1}>
      <Text bold>Enter an API base URL (OpenAI compatible)</Text>
      <Box>
        <Text>baseURL: </Text>
        <TextInput
          value={customBaseURL}
          onChange={setCustomBaseURL}
          onSubmit={() => finishWithBaseURL(customBaseURL)}
        />
      </Box>
      <Text dimColor>Press Enter to finish (Esc to cancel)</Text>
    </Box>
  );
}

export function runFirstRunWizard(): Promise<HelixentConfig> {
  return new Promise((resolve, reject) => {
    const instance = render(
      <FirstRunWizard
        onComplete={(config) => {
          instance.unmount();
          resolve(config);
        }}
        onAbort={() => {
          instance.unmount();
          reject(new Error("Bootstrap cancelled"));
        }}
      />,
    );
  });
}

function maskSecurityString(str: string): string {
  try {
    return str.slice(-8).padStart(str.length, "*");
  } catch {
    return str.replace(/./g, "*");
  }
}
