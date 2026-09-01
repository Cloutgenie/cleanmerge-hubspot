import type { TransformationType } from "./types.js";

const nameParticles = new Set(["a", "an", "and", "as", "at", "but", "by", "de", "del", "der", "di", "for", "from", "in", "la", "of", "on", "or", "the", "to", "van", "von"]);

function titleWord(word: string, index: number): string {
  if (!word) return word;
  const lower = word.toLocaleLowerCase("en-US");
  if (index > 0 && nameParticles.has(lower)) return lower;
  return lower.replace(/(^|['’])([\p{L}])/gu, (_, prefix: string, letter: string) =>
    `${prefix}${letter.toLocaleUpperCase("en-US")}`,
  );
}

export function properCase(input: string): string {
  let wordIndex = 0;
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((token) => token.split("-").map((part) => titleWord(part, wordIndex++)).join("-"))
    .join(" ");
}

export function extractDomain(input: string): string {
  const candidate = input.trim().toLocaleLowerCase("en-US");
  const withoutScheme = candidate.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const authority = withoutScheme.split(/[/?#]/, 1)[0] ?? "";
  const host = authority.replace(/^[^@]+@/, "").replace(/:\d+$/, "").replace(/^www\d*\./i, "").replace(/\.$/, "");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host)) {
    throw new Error("Input does not contain a valid domain");
  }
  return host;
}

export function formatPhoneE164(input: string): string {
  const trimmed = input.trim();
  const hasInternationalPrefix = trimmed.startsWith("+") || /^00/.test(trimmed);
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!hasInternationalPrefix && digits.length === 10) digits = `1${digits}`;
  if (!hasInternationalPrefix && digits.length === 11 && digits.startsWith("1")) {
    // Already a US country code plus national number.
  }
  if (!/^\d{8,15}$/.test(digits) || digits.startsWith("0")) {
    throw new Error("Phone number must contain 8 to 15 digits and include a country code for non-US numbers");
  }
  return `+${digits}`;
}

export function splitName(input: string): { firstName: string; lastName: string } {
  const parts = input.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) throw new Error("Name cannot be empty");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function transform(input: string, type: TransformationType): string {
  switch (type) {
    case "Proper_Case": return properCase(input);
    case "Uppercase": return input.toLocaleUpperCase("en-US");
    case "Lowercase": return input.toLocaleLowerCase("en-US");
    case "Extract_Domain": return extractDomain(input);
    case "Format_Phone_E164": return formatPhoneE164(input);
    case "Split_First_Name": return splitName(input).firstName;
    case "Split_Last_Name": return splitName(input).lastName;
  }
}
