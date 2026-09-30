import { atom, createStore, type Atom, type WritableAtom } from "jotai/vanilla";
import { z } from "zod";

const snapshotSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  baseCode: z.string(),
  quoteCode: z.string(),
  isInternal: z.boolean(),
  rows: z.array(z.object({ id: z.string().min(1), level: z.string() })),
}).superRefine((value, context) => {
  const ids = new Set<string>();
  value.rows.forEach((row, index) => {
    if (ids.has(row.id)) context.addIssue({ code: "custom", message: "Duplicate row ID", path: ["rows", index, "id"] });
    ids.add(row.id);
  });
});

export type WorkspaceSnapshot = z.infer<typeof snapshotSchema>;
export const parseWorkspaceSnapshot = (value: unknown): WorkspaceSnapshot => snapshotSchema.parse(value);
export type TextField = {
  value: WritableAtom<string, [string], void>;
  error: Atom<string | null>;
};
export type EditorRow = { readonly id: string; readonly level: TextField };

const errorFor = (value: string, max: number) => value.length > max ? `Use at most ${max} characters` : null;

/** Factories are pure: no timers, global state, persistence, or subscriptions. */
export function createWorkspace(initial?: WorkspaceSnapshot) {
  const snapshot = parseWorkspaceSnapshot(initial ?? {
    version: 1,
    id: crypto.randomUUID(),
    baseCode: "BASE",
    quoteCode: "QUOTE",
    isInternal: true,
    rows: [{ id: crypto.randomUUID(), level: "" }],
  });
  const store = createStore();
  const revisionState = atom(0);
  const savedRevision = atom(0);
  const invalidRows = atom(snapshot.rows.filter((row) => errorFor(row.level, 3)).length);
  const rowsState = atom<readonly EditorRow[]>([]);
  const aliveByRow = new WeakMap<EditorRow, WritableAtom<boolean, [boolean], void>>();

  function createField(initialValue: string, max: number, alive?: Atom<boolean>): TextField {
    const state = atom(initialValue);
    return {
      value: atom(
        (get) => get(state),
        (get, set, value: string) => {
          if (alive && !get(alive)) return;
          const previous = get(state);
          if (previous === value) return;
          if (alive) {
            const delta = Number(!!errorFor(value, max)) - Number(!!errorFor(previous, max));
            if (delta) set(invalidRows, get(invalidRows) + delta);
          }
          set(state, value);
          set(revisionState, get(revisionState) + 1);
        },
      ),
      error: atom((get) => errorFor(get(state), max)),
    };
  }

  function createRow(id: string, level: string): EditorRow {
    const alive = atom(true);
    const row = { id, level: createField(level, 3, alive) };
    aliveByRow.set(row, alive);
    return row;
  }

  const baseCode = createField(snapshot.baseCode, 6);
  const quoteCode = createField(snapshot.quoteCode, 6);
  const internalState = atom(snapshot.isInternal);
  const isInternal = atom(
    (get) => get(internalState),
    (get, set, value: boolean) => {
      if (get(internalState) === value) return;
      set(internalState, value);
      set(revisionState, get(revisionState) + 1);
    },
  );
  const rows = atom((get) => get(rowsState));
  const errorCount = atom((get) => get(invalidRows) + Number(!!get(baseCode.error)) + Number(!!get(quoteCode.error)));
  const dirty = atom((get) => get(revisionState) !== get(savedRevision));
  const availableModes = atom((get) => get(isInternal) ? ["alpha"] : ["beta"]);
  const revision = atom((get) => get(revisionState));

  const addRows = atom(null, (get, set, count: number) => {
    if (!Number.isInteger(count) || count < 1 || count > 10_000) throw new RangeError("Row count must be between 1 and 10,000");
    const additions = Array.from({ length: count }, () => createRow(crypto.randomUUID(), ""));
    set(rowsState, [...get(rowsState), ...additions]);
    set(revisionState, get(revisionState) + 1);
  });
  const removeRow = atom(null, (get, set, row: EditorRow) => {
    const alive = aliveByRow.get(row);
    if (!alive || !get(alive)) return;
    set(alive, false);
    if (get(row.level.error)) set(invalidRows, get(invalidRows) - 1);
    set(rowsState, get(rowsState).filter((candidate) => candidate !== row));
    set(revisionState, get(revisionState) + 1);
  });
  const broadcastLevel = atom(null, (get, set, value: string) => {
    // One explicit transaction; empty strings and repeated commands are valid.
    for (const row of get(rowsState)) set(row.level.value, value);
  });
  store.set(rowsState, snapshot.rows.map((row) => createRow(row.id, row.level)));

  return {
    id: snapshot.id,
    store,
    baseCode,
    quoteCode,
    isInternal,
    rows,
    errorCount,
    dirty,
    revision,
    availableModes,
    actions: {
      addRows: (count = 1) => store.set(addRows, count),
      removeRow: (row: EditorRow) => store.set(removeRow, row),
      broadcastLevel: (value: string) => store.set(broadcastLevel, value),
      acknowledgeSave: (submittedRevision: number) => {
        if (!Number.isInteger(submittedRevision) || submittedRevision < 0 || submittedRevision > store.get(revisionState)) throw new RangeError("Invalid saved revision");
        store.set(savedRevision, Math.max(store.get(savedRevision), submittedRevision));
      },
    },
    toSnapshot: (): WorkspaceSnapshot => ({
      version: 1,
      id: snapshot.id,
      baseCode: store.get(baseCode.value),
      quoteCode: store.get(quoteCode.value),
      isInternal: store.get(isInternal),
      rows: store.get(rows).map((row) => ({ id: row.id, level: store.get(row.level.value) })),
    }),
  };
}

export type Workspace = ReturnType<typeof createWorkspace>;
