import type { Option } from "./options/optionsSource.ts";

/**
 * The deal's own settings: whether it is internal, and its hedge type, whose
 * options depend on it. Shown in their own subgrid, beside the deal column,
 * from `DEAL_SETTINGS_FIRST_ROW` down.
 */
export type DealSettingsState = { isInternal: boolean; hedgeType: string };

export const hedgeTypesFor = (isInternal: boolean): readonly string[] =>
  isInternal ? ["a", "b", "c"] : ["d", "e", "f"];

/** The hedge type to keep when the options change: the current one if still offered, else the first. */
export const reconcileHedgeType = (current: string, hedgeTypes: readonly string[]) =>
  hedgeTypes.includes(current) ? current : (hedgeTypes[0] ?? "");

export const initialDealSettings: DealSettingsState = {
  isInternal: true,
  hedgeType: hedgeTypesFor(true)[0],
};

/** The settings subgrid's rows, top-down. */
export const dealSettings = [
  { id: "hedgeType", label: "Hedge Type" },
  { id: "isInternal", label: "Internal" },
] as const;

export type DealSettingId = (typeof dealSettings)[number]["id"];

/** The grid row of the first setting: a few rows down, beside the deal's fields. */
export const DEAL_SETTINGS_FIRST_ROW = 2;

export const isDealSetting = (key: string): key is DealSettingId =>
  dealSettings.some((setting) => setting.id === key);

/** A setting's new state, as the deal stores it: a hedge type stays one of its options. */
export const withSetting = (
  settings: DealSettingsState,
  id: DealSettingId,
  value: unknown,
): DealSettingsState => {
  if (id === "isInternal") {
    const isInternal = value === true || value === "true";
    return { isInternal, hedgeType: reconcileHedgeType(settings.hedgeType, hedgeTypesFor(isInternal)) };
  }
  const hedgeType = String(value);
  return hedgeTypesFor(settings.isInternal).includes(hedgeType) ? { ...settings, hedgeType } : settings;
};

/** The dropdown options of each setting: Yes/No, or the hedge types on offer. */
export const settingOptions = (id: DealSettingId, settings: DealSettingsState): readonly Option[] =>
  id === "isInternal"
    ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }]
    : hedgeTypesFor(settings.isInternal).map((type) => ({ value: type, label: type }));
