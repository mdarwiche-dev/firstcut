// Path 3 — pasted text spec (§5.4). Same schema, same retry rule.
import { ExtractionResult } from "./schema";
import { extractViaClaude, MinimalAnthropicClient } from "./llm";

export async function extractFromText(
  text: string,
  client: MinimalAnthropicClient,
): Promise<ExtractionResult> {
  return extractViaClaude({
    client,
    inputType: "text",
    userContent: [
      {
        type: "text",
        text: `Pasted spec text (documentType "spec_text"; sources are "user_text" or "inferred"):\n\n${text}`,
      },
    ],
  });
}
