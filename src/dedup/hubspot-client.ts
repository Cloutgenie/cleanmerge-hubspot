export interface CrmRecord {
  id: string;
  properties: Record<string, string | null>;
}

interface CrmListResponse {
  results: CrmRecord[];
  paging?: { next?: { after: string } };
}

export async function getObject(
  accessToken: string,
  objectType: "companies" | "contacts",
  id: string,
  properties: string[],
): Promise<CrmRecord> {
  const url = new URL(`https://api.hubapi.com/crm/v3/objects/${objectType}/${id}`);
  url.searchParams.set("properties", properties.join(","));
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`HubSpot get ${objectType}/${id} failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as CrmRecord;
}

export async function updateObject(
  accessToken: string,
  objectType: "companies" | "contacts",
  id: string,
  properties: Record<string, string>,
): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/${id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ properties }),
  });
  if (!response.ok) throw new Error(`HubSpot update ${objectType}/${id} failed (${response.status}): ${await response.text()}`);
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

/** Creates the custom property if it doesn't already exist; treats a concurrent create (409) as success. */
export async function ensurePropertyExists(
  accessToken: string,
  objectType: "companies" | "contacts",
  propertyName: string,
  label: string,
): Promise<void> {
  const getResponse = await fetch(`https://api.hubapi.com/crm/v3/properties/${objectType}/${propertyName}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (getResponse.ok) return;
  if (getResponse.status !== 404) throw new Error(`HubSpot get property ${objectType}/${propertyName} failed (${getResponse.status}): ${await getResponse.text()}`);

  const createResponse = await fetch(`https://api.hubapi.com/crm/v3/properties/${objectType}`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name: propertyName, label, type: "string", fieldType: "text", groupName: `${objectType}information` }),
  });
  if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error(`HubSpot create property ${objectType}/${propertyName} failed (${createResponse.status}): ${await createResponse.text()}`);
  }
}

/** Archives (soft-deletes) a record. HubSpot returns 204 No Content on success. */
export async function archiveObject(
  accessToken: string,
  objectType: "companies" | "contacts",
  id: string,
): Promise<void> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/${id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`HubSpot archive ${objectType}/${id} failed (${response.status}): ${await response.text()}`);
}

export async function mergeObjects(
  accessToken: string,
  objectType: "companies" | "contacts",
  primaryObjectId: string,
  objectIdToMerge: string,
): Promise<CrmRecord> {
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/merge`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ primaryObjectId, objectIdToMerge }),
  });
  if (!response.ok) throw new Error(`HubSpot merge ${objectType} failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as CrmRecord;
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

export interface HubSpotOwner {
  id: string;
  email: string;
}

interface OwnersListResponse {
  results: Array<{ id: string; email: string; archived?: boolean }>;
  paging?: { next?: { after: string } };
}

/** Enumerates every (non-archived) HubSpot user/owner in the portal — used to seed an allowlist with staff email addresses. */
export async function listOwners(accessToken: string): Promise<HubSpotOwner[]> {
  const results: HubSpotOwner[] = [];
  let after: string | undefined;

  do {
    const url = new URL("https://api.hubapi.com/crm/v3/owners");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`HubSpot list owners failed (${response.status}): ${await response.text()}`);
    const data = (await response.json()) as OwnersListResponse;
    for (const owner of data.results) {
      if (!owner.archived && owner.email) results.push({ id: owner.id, email: owner.email });
    }
    after = data.paging?.next?.after;
  } while (after);

  return results;
}
