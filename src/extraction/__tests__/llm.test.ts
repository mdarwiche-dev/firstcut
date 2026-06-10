import { describe, expect, it, vi } from "vitest";
import { extractViaClaude, MinimalAnthropicClient } from "../llm";
import { extractFromText } from "../text";
import type { Extraction } from "../schema";

const goodExtraction: Extraction = {
  documentType: "spec_text",
  drawingNumber: { value: null, confidence: "high", source: "user_text" },
  drawingTitle: { value: null, confidence: "high", source: "user_text" },
  units: { value: "in", confidence: "medium", source: "inferred" },
  envelope: {
    a: { value: 7.5, confidence: "high", source: "user_text" },
    b: { value: 3.2, confidence: "high", source: "user_text" },
    c: { value: 1.1, confidence: "high", source: "user_text" },
  },
  material: { rawText: "7075-T651", confidence: "high", source: "user_text" },
  quantity: { value: 4, confidence: "high", source: "user_text" },
  toleranceNotes: [],
  flatnessCritical: { value: false, confidence: "medium", source: "inferred" },
  ambiguities: [],
};

function mockClient(...responses: (string | Error)[]): {
  client: MinimalAnthropicClient;
  create: ReturnType<typeof vi.fn>;
} {
  let call = 0;
  const create = vi.fn(async () => {
    const r = responses[Math.min(call++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return { content: [{ type: "text", text: r }] };
  });
  return { client: { messages: { create } }, create };
}

describe("extractViaClaude retry logic (§5.2 step 5)", () => {
  it("valid first response: one call, ok result", async () => {
    const { client, create } = mockClient(JSON.stringify(goodExtraction));
    const r = await extractViaClaude({
      client,
      userContent: [{ type: "text", text: "spec" }],
      inputType: "text",
    });
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    if (r.ok) expect(r.extraction.material.rawText).toBe("7075-T651");
  });

  it("schema failure then success: exactly one retry with error + prior output appended", async () => {
    const bad = JSON.stringify({ ...goodExtraction, documentType: "invalid_type" });
    const { client, create } = mockClient(bad, JSON.stringify(goodExtraction));
    const r = await extractViaClaude({
      client,
      userContent: [{ type: "text", text: "spec" }],
      inputType: "text",
    });
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    const retryMessages = create.mock.calls[1][0].messages;
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[1]).toEqual({ role: "assistant", content: bad });
    expect(retryMessages[2].content).toContain("Fix the JSON to satisfy the schema");
  });

  it("two schema failures: error state with attempts 2, never a fabricated result", async () => {
    const bad = JSON.stringify({ nonsense: true });
    const { client, create } = mockClient(bad, bad);
    const r = await extractViaClaude({
      client,
      userContent: [{ type: "text", text: "spec" }],
      inputType: "text",
    });
    expect(r.ok).toBe(false);
    expect(create).toHaveBeenCalledTimes(2);
    if (!r.ok) {
      expect(r.error.stage).toBe("schema");
      expect(r.error.attempts).toBe(2);
    }
  });

  it("non-JSON prose triggers the parse stage and is retried", async () => {
    const { client, create } = mockClient(
      "Sure! Here is the extraction: ...",
      JSON.stringify(goodExtraction),
    );
    const r = await extractViaClaude({
      client,
      userContent: [{ type: "text", text: "spec" }],
      inputType: "text",
    });
    expect(r.ok).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].messages[2].content).toContain("parse");
  });

  it("inferred+high in model output is rejected by the schema gate", async () => {
    const sneaky = structuredClone(goodExtraction);
    sneaky.units = { value: "in", confidence: "high", source: "inferred" };
    const { client } = mockClient(JSON.stringify(sneaky), JSON.stringify(sneaky));
    const r = await extractViaClaude({
      client,
      userContent: [{ type: "text", text: "spec" }],
      inputType: "text",
    });
    expect(r.ok).toBe(false);
  });

  it("API error surfaces as llm-stage error", async () => {
    const { client } = mockClient(new Error("overloaded_error"));
    const r = await extractViaClaude({
      client,
      userContent: [{ type: "text", text: "spec" }],
      inputType: "text",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.stage).toBe("llm");
      expect(r.error.message).toContain("overloaded_error");
    }
  });

  it("extractFromText wires the pasted text through with temperature 0", async () => {
    const { client, create } = mockClient(JSON.stringify(goodExtraction));
    const r = await extractFromText("7075-T651, finished part 7.5 x 3.2 x 1.1, qty 4", client);
    expect(r.ok).toBe(true);
    const params = create.mock.calls[0][0];
    expect(params.temperature).toBe(0);
    expect(params.model).toBe("claude-sonnet-4-6");
    expect(JSON.stringify(params.messages[0].content)).toContain("7.5 x 3.2 x 1.1");
  });
});
