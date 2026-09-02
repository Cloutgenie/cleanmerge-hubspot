import { createObject, type CrmRecord } from "./hubspot-client.js";

const TEST_COMPANIES: Record<string, string>[] = [
  { name: "Acme Corporation [CLEANMERGE-TEST]", domain: "acme-cleanmerge-test.com", phone: "312-555-0101" },
  { name: "Acme Corp [CLEANMERGE-TEST]", domain: "acme-cleanmerge-test.com", phone: "312-555-0101" },
  { name: "Globex Industries [CLEANMERGE-TEST]", domain: "globex-cleanmerge-test.com", phone: "212-555-0199" },
];

const TEST_CONTACTS: Record<string, string>[] = [
  { firstname: "Bob", lastname: "Smith [CLEANMERGE-TEST]", email: "bob.smith.cleanmerge.test@example.com", phone: "312-555-0111" },
  { firstname: "Robert", lastname: "Smith [CLEANMERGE-TEST]", email: "bob.smith.cleanmerge.test@example.com", phone: "312-555-0111" },
  { firstname: "Alice", lastname: "Jones [CLEANMERGE-TEST]", email: "alice.jones.cleanmerge.test@example.com", phone: "212-555-0122" },
];

export interface SeedResult {
  companies: CrmRecord[];
  contacts: CrmRecord[];
}

/** Creates a small set of clearly-labeled test records, including one deliberate near-duplicate pair per object type, to validate dedup scoring against real API behavior. */
export async function seedDedupTestData(accessToken: string): Promise<SeedResult> {
  const companies: CrmRecord[] = [];
  for (const properties of TEST_COMPANIES) companies.push(await createObject(accessToken, "companies", properties));

  const contacts: CrmRecord[] = [];
  for (const properties of TEST_CONTACTS) contacts.push(await createObject(accessToken, "contacts", properties));

  return { companies, contacts };
}
