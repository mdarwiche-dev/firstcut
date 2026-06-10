// Live Anthropic client factory. Only the API route and scripts/e2e-live.ts
// import this; tests inject mocks via the MinimalAnthropicClient interface.
import Anthropic from "@anthropic-ai/sdk";
import type { MinimalAnthropicClient } from "./llm";

export function getAnthropicClient(): MinimalAnthropicClient {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic() as unknown as MinimalAnthropicClient;
}
