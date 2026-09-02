export interface JudgmentResult {
  sameEntity: boolean;
  confidence: number;
  rationale: string;
}

const JUDGMENT_TOOL = {
  name: "record_judgment",
  description: "Judge whether two CRM records refer to the same real-world entity.",
  input_schema: {
    type: "object",
    properties: {
      sameEntity: { type: "boolean", description: "True only if both records almost certainly refer to the same real-world entity." },
      confidence: { type: "number", description: "Confidence in this judgment, from 0 to 1." },
      rationale: { type: "string", description: "One or two sentence explanation, citing the specific fields that drove the verdict." },
    },
    required: ["sameEntity", "confidence", "rationale"],
  },
};

/**
 * Asks Claude to judge one ambiguous candidate pair — the ones deterministic scoring couldn't
 * confidently resolve (e.g. same phone, similar-but-not-identical name, no shared hard identifier).
 * Never called for high-confidence or discarded pairs; never auto-merges on its own — the verdict
 * is meant to pre-sort a human review queue, not replace one.
 */
export async function judgeCandidate(
  apiKey: string,
  objectType: "COMPANY" | "CONTACT",
  propertiesA: Record<string, string | null>,
  propertiesB: Record<string, string | null>,
  scoreBreakdown: Record<string, number>,
): Promise<JudgmentResult> {
  const entityLabel = objectType === "COMPANY" ? "company" : "person";
  const prompt = `You are deduplicating HubSpot CRM ${objectType.toLowerCase()} records. Deterministic scoring found these two records similar but not conclusively identical.

Record A: ${JSON.stringify(propertiesA)}
Record B: ${JSON.stringify(propertiesB)}
Score breakdown: ${JSON.stringify(scoreBreakdown)}

Judge whether these records represent the same real-world ${entityLabel}. Consider name variants, nicknames, and abbreviations, but also consider that a shared phone number or address can be entirely coincidental (e.g. a shared office line, a family member, a former employee). Default to sameEntity=false when genuinely uncertain — a human will review this either way.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      tools: [JUDGMENT_TOOL],
      tool_choice: { type: "tool", name: "record_judgment" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic judgment request failed (${response.status}): ${await response.text()}`);

  const data = (await response.json()) as { content: Array<{ type: string; input?: JudgmentResult }> };
  const toolUse = data.content.find((block) => block.type === "tool_use");
  if (!toolUse?.input) throw new Error("Anthropic response did not include a tool_use judgment");
  return toolUse.input;
}
