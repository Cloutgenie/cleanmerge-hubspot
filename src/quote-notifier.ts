import type { QuoteRequest } from "./quote-store.js";

export type QuoteNotifier = (request: QuoteRequest) => Promise<void>;

export interface QuoteNotifierOptions {
  apiKey: string;
  to: string;
  from: string;
}

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export function formatQuoteEmail(request: QuoteRequest): { subject: string; text: string } {
  const lines = [
    `New Warehouse Sync quote request`,
    ``,
    `Name: ${request.name}`,
    `Email: ${request.email}`,
    `Company: ${request.company}`,
    `HubSpot account ID: ${request.hubspotPortalId ?? "not provided"}`,
    ``,
    `Data lives in: ${request.warehouse}`,
    `Sync into HubSpot: ${request.objects.join(", ")}`,
    `Approximate size: ${request.rowVolume}`,
    `Frequency: ${request.frequency}`,
    `Connections: ${request.connections}`,
    `Timeline: ${request.timeline}`,
    ``,
    `Notes: ${request.notes ?? "none"}`,
    ``,
    `Reply to this email to answer ${request.name} directly.`,
    `Request ID: ${request.id}`,
  ];
  return { subject: `Quote request: ${oneLine(request.company)} (${request.warehouse})`, text: lines.join("\n") };
}

export function createResendNotifier(options: QuoteNotifierOptions): QuoteNotifier {
  return async (request) => {
    const { subject, text } = formatQuoteEmail(request);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: options.from, to: [options.to], reply_to: request.email, subject, text }),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}`);
  };
}
