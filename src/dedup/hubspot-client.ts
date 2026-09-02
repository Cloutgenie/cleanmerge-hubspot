export interface CrmRecord {
  id: string;
  properties: Record<string, string | null>;
}

interface CrmListResponse {
  results: CrmRecord[];
  paging?: { next?: { after: string } };
}

export async function createObject(
  accessToken: string,
  objectType: "companies" | "contacts",
  properties: Record<string, string>,
): Promise<CrmRecord> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ properties }),
  });
  if (!response.ok) throw new Error(`HubSpot create ${objectType} failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as CrmRecord;
}

export async function archiveObject(accessToken: string, objectType: "companies" | "contacts", id: string): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/${id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`HubSpot archive ${objectType}/${id} failed (${response.status}): ${await response.text()}`);
}

/** Enumerates every object of a type in the portal, paginating until exhausted. */
export async function listAllObjects(
  accessToken: string,
  objectType: "companies" | "contacts",
  properties: string[],
): Promise<CrmRecord[]> {
  const results: CrmRecord[] = [];
  let after: string | undefined;

  do {
    const url = new URL(`https://api.hubapi.com/crm/v3/objects/${objectType}`);
    url.searchParams.set("properties", properties.join(","));
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`HubSpot list ${objectType} failed (${response.status}): ${await response.text()}`);
    const data = (await response.json()) as CrmListResponse;
    results.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);

  return results;
}
