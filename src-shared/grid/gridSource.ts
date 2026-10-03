import { isSyncedField } from "../dealFields.ts";
import {
  type FieldId,
  type ProductFieldId,
  type SelectFieldId,
  asyncOptionFields,
  fieldExists,
  fields,
  fieldInputTypes,
  fieldOptions,
  isAsyncOptions,
} from "../fields.ts";
import { type Option, type OptionsState, optionsKey } from "../options/optionsSource.ts";
import { type GenericProductDefinition, isReadOnly } from "../products/productRegistry.ts";
import type { SpotPriceStream } from "../spotPriceStream.ts";

/**
 * What the deal grid needs from a deal, whatever the state library. Each app
 * implements it over its own store: how it reads cells, how it reports which
 * cells changed, and above all how it applies a batch of writes (a paste) is
 * where the libraries differ.
 */

/** The deal column: synced and broadcast fields, and the spot price. */
export const DEAL_COLUMN_ID = "deal";

export type GridColumn = {
  /** A product id, or `DEAL_COLUMN_ID`. */
  id: string;
  title: string;
  /** The product's group; the deal column has none. */
  group?: { id: string; title: string };
};

/** A cell as the grid shows it; `null` where the column has no such field. */
export type CellView = {
  value: unknown;
  hasError: boolean;
  readOnly: boolean;
  /** Dropdowns: the options to show (async ones may still be loading). */
  options?: { status: OptionsState["status"]; options: readonly Option[] };
};

export type CellRef = { columnId: string; fieldId: FieldId };
export type CellWrite = CellRef & { value: unknown };

export type GridSource = {
  getColumns(): readonly GridColumn[];
  /** Groups or products added, removed or renamed. */
  subscribeColumns(onChange: () => void): () => void;
  getCell(columnId: string, fieldId: FieldId): CellView | null;
  /** The cells whose value, issues or options changed. */
  subscribeCells(onChange: (cells: readonly CellRef[]) => void): () => void;
  /** Applies writes in order, as one batch; a single edit is a batch of one. */
  write(writes: readonly CellWrite[]): void;
  cloneGroup(groupId: string): void;
  removeGroup(groupId: string): void;
  /** Ticks outside the stores: the grid repaints just that cell. */
  spotPriceStream: SpotPriceStream;
};

// the same objects every time, so a cell's options compare by identity
const notLoadedYet: OptionsState = { status: "loading", options: [] };
const fixedOptions = new Map<FieldId, OptionsState>();

/** A dropdown's options for a parameter (the field it depends on), from an app's loaded lists. */
export const cellOptions = (
  fieldId: FieldId,
  param: unknown,
  byKey: Readonly<Record<string, OptionsState>>,
): CellView["options"] => {
  if (fieldInputTypes[fieldId] !== "select") return undefined;
  const options = fieldOptions[fieldId as SelectFieldId];
  if (!isAsyncOptions(options)) {
    if (!fixedOptions.has(fieldId)) fixedOptions.set(fieldId, { status: "loaded", options });
    return fixedOptions.get(fieldId);
  }
  const key = optionsKey(options.source, param ? String(param) : options.defaultParam);
  return byKey[key] ?? notLoadedYet;
};

/** A product's cell, read through `read`; `null` for a field it doesn't have. */
export const productCell = (
  definition: GenericProductDefinition,
  read: (fieldId: ProductFieldId) => unknown,
  fieldId: FieldId,
  hasError: boolean,
  byKey: Readonly<Record<string, OptionsState>>,
): CellView | null => {
  if (!(fieldId in definition.fieldPaths)) return null; // e.g. the deal-only spot stream
  const id = fieldId as ProductFieldId;
  if (!fieldExists(id, read)) return null;
  const asyncField = asyncOptionFields.find((field) => field.fieldId === id);
  return {
    value: read(id),
    hasError,
    readOnly: isReadOnly(definition, id),
    options: cellOptions(id, asyncField && read(asyncField.options.dependsOn), byKey),
  };
};

/**
 * A deal column cell. Synced fields show the deal's value; broadcasts hold
 * nothing (a write goes to every product); the spot price is read-only.
 */
export const dealCell = (
  fieldId: FieldId,
  syncedValue: unknown,
  byKey: Readonly<Record<string, OptionsState>>,
  spotPriceStream: SpotPriceStream,
): CellView => {
  if (fieldId === "spotStream") {
    return { value: spotPriceStream.getValue(), hasError: false, readOnly: true };
  }
  return {
    value: isSyncedField(fieldId) ? syncedValue : undefined,
    hasError: false,
    readOnly: false,
    options: cellOptions(fieldId, undefined, byKey),
  };
};

/** Async fields whose options (and existence) follow `fieldId`: repaint them with it. */
export const dependentFields = (fieldId: FieldId): FieldId[] =>
  asyncOptionFields
    .filter(({ options }) => options.dependsOn === fieldId)
    .map((field) => field.fieldId);

/**
 * Collects changed cells and hands them to the grid once per tick, each
 * cell once, and only if what the grid shows of it really changed: value,
 * error, read-only, or options. Adapters report candidates (e.g. every field
 * of a product that changed); this narrows them to actual repaints.
 *
 * What the grid shows is recorded up front, and for a new column as the
 * columns change, when the grid draws it whole. Returns the notifier and
 * its unsubscribe.
 */
export const createCellNotifier = (
  source: Pick<GridSource, "getCell" | "getColumns" | "subscribeColumns">,
  onChange: (cells: readonly CellRef[]) => void,
) => {
  const keyOf = (cell: CellRef) => `${cell.columnId}:${cell.fieldId}`;
  const shown = new Map<string, CellView | null>();
  const knownColumns = new Set<string>();
  const pending = new Map<string, CellRef>();

  const recordNewColumns = () => {
    for (const { id: columnId } of source.getColumns()) {
      if (knownColumns.has(columnId)) continue;
      knownColumns.add(columnId);
      for (const { id: fieldId } of fields) {
        shown.set(keyOf({ columnId, fieldId }), source.getCell(columnId, fieldId));
      }
    }
  };
  const isSame = (a: CellView | null | undefined, b: CellView | null) =>
    a === b ||
    (a !== null && a !== undefined && b !== null &&
      Object.is(a.value, b.value) &&
      a.hasError === b.hasError &&
      a.readOnly === b.readOnly &&
      a.options === b.options);

  const flush = () => {
    const changed: CellRef[] = [];
    for (const [key, cell] of pending) {
      const view = source.getCell(cell.columnId, cell.fieldId);
      if (isSame(shown.get(key), view)) continue;
      shown.set(key, view);
      changed.push(cell);
    }
    pending.clear();
    if (changed.length) onChange(changed);
  };

  recordNewColumns();
  const stop = source.subscribeColumns(recordNewColumns);
  const notify = (cells: readonly CellRef[]) => {
    if (!pending.size) queueMicrotask(flush);
    for (const cell of cells) pending.set(keyOf(cell), cell);
  };
  return { notify, stop };
};
