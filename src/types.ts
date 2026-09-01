export const transformationTypes = [
  "Proper_Case",
  "Uppercase",
  "Lowercase",
  "Extract_Domain",
  "Format_Phone_E164",
  "Split_First_Name",
  "Split_Last_Name",
] as const;

export type TransformationType = (typeof transformationTypes)[number];

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  hubId?: number;
}
