export interface SerializedChangeModeParam {
  type: "String" | "Integer";
  value: string;
}

export function serializeChangeModeParams(
  newMode: string,
  params: readonly unknown[]
): SerializedChangeModeParam[] {
  if (newMode === "speculation") {
    return [
      { type: "String", value: String(params[0] ?? "GAS") },
      { type: "Integer", value: String(params[1] ?? "0") },
    ];
  }

  return params.map((param) => ({
    type: "String" as const,
    value: String(param),
  }));
}
