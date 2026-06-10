// Claude extraction call with the §5.2 retry rule: on parse/schema failure,
// retry exactly once with the validation error and previous raw output
// appended; on second failure return a structured error. Never fabricate.
import { ExtractionResult, ExtractionSchema } from "./schema";
import {
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_MODEL,
  EXTRACTION_SYSTEM_PROMPT,
} from "./prompt";

// Minimal structural interface so tests inject a mock and the live client
// (Anthropic SDK) satisfies it without adapters.
export interface ContentBlockParam {
  type: string;
  [key: string]: unknown;
}
export interface MinimalAnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      messages: Array<{ role: "user" | "assistant"; content: string | ContentBlockParam[] }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

function responseText(res: { content: Array<{ type: string; text?: string }> }): string {
  return res.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

export async function extractViaClaude(opts: {
  client: MinimalAnthropicClient;
  userContent: ContentBlockParam[];
  inputType: "pdf" | "text";
}): Promise<ExtractionResult> {
  const baseParams = {
    model: EXTRACTION_MODEL,
    max_tokens: EXTRACTION_MAX_TOKENS,
    temperature: 0,
    system: EXTRACTION_SYSTEM_PROMPT,
  };

  let raw: string;
  try {
    const first = await opts.client.messages.create({
      ...baseParams,
      messages: [{ role: "user", content: opts.userContent }],
    });
    raw = responseText(first);
  } catch (e) {
    return llmError("llm", e, 1);
  }

  const attempt1 = validate(raw);
  if (attempt1.ok) return { ok: true, extraction: attempt1.extraction, inputType: opts.inputType };

  // Retry exactly once, appending the error and previous raw output.
  let raw2: string;
  try {
    const second = await opts.client.messages.create({
      ...baseParams,
      messages: [
        { role: "user", content: opts.userContent },
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `Your previous output failed validation.\n\nError (${attempt1.stage}): ${attempt1.message}\n\nFix the JSON to satisfy the schema; change nothing else. Output only the corrected JSON.`,
        },
      ],
    });
    raw2 = responseText(second);
  } catch (e) {
    return llmError("llm", e, 2);
  }

  const attempt2 = validate(raw2);
  if (attempt2.ok) return { ok: true, extraction: attempt2.extraction, inputType: opts.inputType };

  return {
    ok: false,
    error: { stage: attempt2.stage, message: attempt2.message, attempts: 2, raw: raw2 },
  };
}

type Validated =
  | { ok: true; extraction: import("./schema").Extraction }
  | { ok: false; stage: "parse" | "schema"; message: string };

function validate(raw: string): Validated {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, stage: "parse", message: `response is not valid JSON: ${(e as Error).message}` };
  }
  const result = ExtractionSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, stage: "schema", message: result.error.message };
  }
  return { ok: true, extraction: result.data };
}

function llmError(stage: "llm", e: unknown, attempts: number): ExtractionResult {
  return {
    ok: false,
    error: { stage, message: e instanceof Error ? e.message : String(e), attempts },
  };
}
