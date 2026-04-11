import Anthropic from "@anthropic-ai/sdk";

import type { AssistantMessage, ModelProvider, ModelProviderInvokeParams, TokenUsage } from "@/foundation";

import { StreamAccumulator } from "./stream-utils";
import {
  convertToAnthropicMessages,
  convertToAnthropicTools,
  extractSystemPrompt,
  parseAssistantMessage,
} from "./utils";

/**
 * A provider for the Anthropic API (Claude models).
 */
export class AnthropicModelProvider implements ModelProvider {
  _client: Anthropic;

  constructor({ baseURL, apiKey }: { baseURL?: string; apiKey?: string } = {}) {
    // Only pass baseURL if it differs from the SDK default, so the SDK's
    // own URL construction logic is used for the standard Anthropic endpoint.
    const isDefaultURL = !baseURL || baseURL === "https://api.anthropic.com";
    this._client = new Anthropic({
      ...(isDefaultURL ? {} : { baseURL }),
      apiKey,
    });
  }

  async invoke(params: ModelProviderInvokeParams) {
    const response = await this._client.messages.create(this._baseMessageParams(params), {
      signal: params.signal,
    });
    return parseAssistantMessage(response, toTokenUsage(response.usage));
  }

  async *stream(params: ModelProviderInvokeParams): AsyncGenerator<AssistantMessage> {
    const response = await this._client.messages.create(
      { ...this._baseMessageParams(params), stream: true },
      { signal: params.signal },
    );

    const acc = new StreamAccumulator();
    for await (const event of response) {
      acc.push(event);
      yield acc.snapshot();
    }
  }

  private _baseMessageParams({
    model,
    messages,
    tools,
    options,
  }: ModelProviderInvokeParams): Anthropic.MessageCreateParamsNonStreaming {
    const system = extractSystemPrompt(messages);
    const anthropicMessages = convertToAnthropicMessages(messages);
    const anthropicTools = tools ? convertToAnthropicTools(tools) : undefined;

    // Normalize options for Anthropic's API.
    // When thinking is enabled, Anthropic requires `budget_tokens`.
    // Default the budget to max_tokens minus a small buffer for the response.
    const normalizedOptions = { ...options };
    const thinking = normalizedOptions.thinking as { type: string; budget_tokens?: number } | undefined;
    if (thinking?.type === "enabled" && !thinking.budget_tokens) {
      const maxTokens = (normalizedOptions.max_tokens as number | undefined) ?? 8192;
      thinking.budget_tokens = Math.floor(maxTokens * 0.8);
      normalizedOptions.thinking = thinking;
    }

    return {
      model,
      max_tokens: 8192,
      messages: anthropicMessages,
      ...(system ? { system } : {}),
      ...(anthropicTools && anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
      ...normalizedOptions,
    };
  }
}

function toTokenUsage(usage?: Anthropic.Usage): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.input_tokens ?? 0,
    completionTokens: usage.output_tokens ?? 0,
    totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
  };
}
