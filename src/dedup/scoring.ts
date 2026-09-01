import { formatPhoneE164, properCase } from "../transformations.js";
import type { CompanyProperties, ContactProperties } from "./blocking.js";
import { jaroWinklerSimilarity } from "./similarity.js";

export type DedupTier = "high" | "ambiguous" | "discard";

export interface ScoreResult {
  score: number;
  tier: DedupTier;
  breakdown: Record<string, number>;
}

const HIGH_CONFIDENCE_THRESHOLD = 0.97;
const AMBIGUOUS_THRESHOLD = 0.70;
/** Without a hard identifier match, phone + name alone can never qualify for auto-merge — phone lines can be shared and names can coincidentally be similar. */
const MAX_SCORE_WITHOUT_HARD_MATCH = 0.95;

function tierFor(score: number): DedupTier {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return "high";
  if (score >= AMBIGUOUS_THRESHOLD) return "ambiguous";
  return "discard";
}

function normalizedPhone(phone?: string | null): string | null {
  if (!phone?.trim()) return null;
  try { return formatPhoneE164(phone.trim()); } catch { return null; }
}

function exactMatch(a: string | null, b: string | null): number {
  return a !== null && b !== null && a === b ? 1 : 0;
}

export function scoreCompanyPair(a: CompanyProperties, b: CompanyProperties): ScoreResult {
  const domainScore = exactMatch(
    a.domain?.trim().toLocaleLowerCase("en-US") ?? null,
    b.domain?.trim().toLocaleLowerCase("en-US") ?? null,
  );
  const phoneScore = exactMatch(normalizedPhone(a.phone), normalizedPhone(b.phone));
  const nameScore = jaroWinklerSimilarity(
    properCase(a.name?.trim() ?? "").toLocaleLowerCase("en-US"),
    properCase(b.name?.trim() ?? "").toLocaleLowerCase("en-US"),
  );
  const breakdown = { domainScore, phoneScore, nameScore };

  if (domainScore === 1) {
    // A shared domain is close to a unique identifier for a company — high confidence even if
    // the name is formatted differently ("Acme Corp" vs "Acme Corporation, Inc.").
    return { score: Math.max(HIGH_CONFIDENCE_THRESHOLD, 0.9 + phoneScore * 0.05 + nameScore * 0.05), tier: "high", breakdown };
  }

  const score = Math.min(MAX_SCORE_WITHOUT_HARD_MATCH, phoneScore * 0.4 + nameScore * 0.6);
  return { score, tier: tierFor(score), breakdown };
}

export function scoreContactPair(a: ContactProperties, b: ContactProperties): ScoreResult {
  const emailScore = exactMatch(
    a.email?.trim().toLocaleLowerCase("en-US") ?? null,
    b.email?.trim().toLocaleLowerCase("en-US") ?? null,
  );
  const phoneScore = exactMatch(normalizedPhone(a.phone), normalizedPhone(b.phone));
  const nameA = `${a.firstname ?? ""} ${a.lastname ?? ""}`.trim();
  const nameB = `${b.firstname ?? ""} ${b.lastname ?? ""}`.trim();
  const nameScore = jaroWinklerSimilarity(properCase(nameA).toLocaleLowerCase("en-US"), properCase(nameB).toLocaleLowerCase("en-US"));
  const breakdown = { emailScore, phoneScore, nameScore };

  if (emailScore === 1) {
    // A shared email is a near-unique identifier for a contact — high confidence even if the
    // name is formatted differently ("Bob Smith" vs "Robert Smith").
    return { score: Math.max(HIGH_CONFIDENCE_THRESHOLD, 0.9 + phoneScore * 0.05 + nameScore * 0.05), tier: "high", breakdown };
  }

  const score = Math.min(MAX_SCORE_WITHOUT_HARD_MATCH, phoneScore * 0.4 + nameScore * 0.6);
  return { score, tier: tierFor(score), breakdown };
}
