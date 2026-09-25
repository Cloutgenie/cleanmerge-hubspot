import { createHash } from "node:crypto";

/** Plain-text agent index for the CleanMerge host. */
export const LLMS_TXT = `# CleanMerge (Jaduno)
> HubSpot CRM normalize and dedup. Built by Jaduno.

- Product: https://cleanmerge.jaduno.com
- Studio: https://jaduno.com
- Contact: jay@vain.agency
- Install: https://cleanmerge.jaduno.com/oauth/install
- Pricing detail: https://cleanmerge.jaduno.com/docs/pricing

## Offers
- Normalize CRM Data (free): $0 forever · up to 50 runs/month · no card. Proper case, domain extract, E.164 phone, name split. Pass-through; no CRM copy held.
- Warehouse Sync (paid): from about $299/month per connection (volume based: about $299 up to 100,000 rows, $599 up to 1 million, quoted above) plus a one-time setup fee from $750. Warehouse → HubSpot with fuzzy + AI dedup and human review queue.

## How to start
1. Install free Normalize: https://cleanmerge.jaduno.com/oauth/install
2. Warehouse Sync: request a quote at https://cleanmerge.jaduno.com/docs/quote or email jay@vain.agency
3. Custom studio work: https://jaduno.com/contact

## Do not
- Do not invent clients, metrics, or marketplace listing status.
- Do not treat CleanMerge as a marketing retainer shop.
`;

export const ROBOTS_TXT = `User-agent: *
Allow: /

Sitemap: https://cleanmerge.jaduno.com/sitemap.xml
`;

const SITEMAP_LOCS = [
  "https://cleanmerge.jaduno.com/",
  "https://cleanmerge.jaduno.com/docs/pricing",
  "https://cleanmerge.jaduno.com/docs/setup",
  "https://cleanmerge.jaduno.com/docs/how-to-use",
  "https://cleanmerge.jaduno.com/docs/quote",
  "https://cleanmerge.jaduno.com/oauth/install",
];

export const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_LOCS.map((loc) => `  <url><loc>${loc}</loc></url>`).join("\n")}
</urlset>
`;

/** SoftwareApplication + Offers. Script body is hashed for the page CSP. */
export const SOFTWARE_APPLICATION_JSON_LD = `{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "CleanMerge",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "url": "https://cleanmerge.jaduno.com",
  "description": "HubSpot CRM normalize and dedup. Free Normalize CRM Data workflow action (50 runs/month). Warehouse Sync with fuzzy and AI matching from about $299/month per connection (volume based: about $299 up to 100,000 rows, $599 up to 1 million, quoted above) plus a one-time setup fee from $750.",
  "offers": [
    {"@type":"Offer","name":"Normalize CRM Data","price":"0","priceCurrency":"USD","description":"Up to 50 runs per month. Pass-through transforms; no CRM copy held."},
    {"@type":"Offer","name":"Warehouse Sync","price":"299","priceCurrency":"USD","description":"Managed warehouse to HubSpot sync with duplicate protection. Per connection. Confirm current price on cleanmerge.jaduno.com."}
  ],
  "provider": {"@type":"Organization","name":"Jaduno","url":"https://jaduno.com","email":"jay@vain.agency"}
}`;

export const softwareApplicationJsonLdScript = `<script type="application/ld+json">${SOFTWARE_APPLICATION_JSON_LD}</script>`;

export const softwareApplicationJsonLdCspSource = `'sha256-${createHash("sha256").update(SOFTWARE_APPLICATION_JSON_LD).digest("base64")}'`;
