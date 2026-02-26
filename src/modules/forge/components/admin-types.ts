export type StagedChangeType =
  | "metadata"
  | "mint"
  | "maxSupply"
  | "burnRate"
  | "creatorFee"
  | "mode"
  | "lock";

export interface StagedChange {
  id: string;
  type: StagedChangeType;
  label: string;
  payload: Record<string, string | number | boolean>;
}

