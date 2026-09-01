import { extractDomain, formatPhoneE164, properCase } from "../transformations.js";

export interface BlockingKey {
  keyType: string;
  keyValue: string;
}

function tryNormalize<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}

function alphanumeric(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
}

export interface CompanyProperties {
  name?: string | null;
  domain?: string | null;
  phone?: string | null;
}

export function computeCompanyBlockingKeys(props: CompanyProperties): BlockingKey[] {
  const keys: BlockingKey[] = [];

  if (props.domain?.trim()) {
    const domain = tryNormalize(() => extractDomain(props.domain!.trim()));
    if (domain) keys.push({ keyType: "domain", keyValue: domain });
  }
  if (props.phone?.trim()) {
    const phone = tryNormalize(() => formatPhoneE164(props.phone!.trim()));
    if (phone) keys.push({ keyType: "phone", keyValue: phone });
  }
  if (props.name?.trim()) {
    const normalized = alphanumeric(properCase(props.name.trim()));
    if (normalized.length >= 4) keys.push({ keyType: "name4", keyValue: normalized.slice(0, 4) });
  }
  return keys;
}

export interface ContactProperties {
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  phone?: string | null;
}

export function computeContactBlockingKeys(props: ContactProperties): BlockingKey[] {
  const keys: BlockingKey[] = [];

  if (props.email?.trim()) {
    keys.push({ keyType: "email", keyValue: props.email.trim().toLocaleLowerCase("en-US") });
  }
  if (props.phone?.trim()) {
    const phone = tryNormalize(() => formatPhoneE164(props.phone!.trim()));
    if (phone) keys.push({ keyType: "phone", keyValue: phone });
  }
  if (props.lastname?.trim()) {
    const normalized = alphanumeric(properCase(props.lastname.trim()));
    if (normalized.length >= 3) keys.push({ keyType: "lastname3", keyValue: normalized.slice(0, 3) });
  }
  return keys;
}
