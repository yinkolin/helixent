import { OpenAI } from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources";

import type { Message, ModelProvider, Tool } from "@/foundation";

import { convertToOpenAIMessages, convertToOpenAITools, parseAssistantMessage } from "./utils";

type AIDPChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
};

/**
 * A provider for the OpenAI API.
 */
export class OpenAIModelProvider implements ModelProvider {
  _client: OpenAI;
  _baseURL?: string;
  _apiKey?: string;

  constructor({ baseURL, apiKey }: { baseURL?: string; apiKey?: string } = {}) {
    this._baseURL = baseURL;
    this._apiKey = apiKey;
    this._client = new OpenAI({
      baseURL,
      apiKey,
    });
  }

  async invoke({
    model,
    messages,
    tools,
    options,
    signal,
  }: {
    model: string;
    messages: Message[];
    tools?: Tool[];
    options?: Record<string, unknown>;
    signal?: AbortSignal;
  }) {
    const url = this._baseURL ? new URL(this._baseURL) : null;
    if (url?.hostname === "aidp.bytedance.net" && url.pathname === "/api/modelhub/online/v2/crawl") {
      url.searchParams.set("ak", this._apiKey ?? "");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: convertToOpenAIMessages(messages),
          tools: tools ? convertToOpenAITools(tools) : undefined,
          temperature: 0,
          top_p: 0,
          ...options,
        }),
        signal,
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AIDP request failed (${response.status} ${response.statusText}): ${errorText}`);
      }
      const data = (await response.json()) as AIDPChatCompletionResponse;
      const message = data.choices?.[0]?.message;
      if (!message) {
        throw new Error(`AIDP response did not include choices[0].message: ${JSON.stringify(data)}`);
      }
      return parseAssistantMessage({
        role: "assistant",
        refusal: null,
        ...message,
      } as Parameters<typeof parseAssistantMessage>[0]);
    }

    const params = {
      model,
      messages: convertToOpenAIMessages(messages),
      tools: tools ? convertToOpenAITools(tools) : undefined,
      temperature: 0,
      top_p: 0,
      ...options,
    } satisfies ChatCompletionCreateParamsNonStreaming;
    const { choices } = await this._client.chat.completions.create(params, { signal });
    return parseAssistantMessage(choices[0]!.message!);
  }
}
