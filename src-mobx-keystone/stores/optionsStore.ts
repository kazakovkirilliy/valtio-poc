import { Model, model, modelAction, prop } from "mobx-keystone";
import {
  type Option,
  type OptionsSource,
  type OptionsState,
  optionsFailed,
  optionsKey,
  optionsLoaded,
  optionsLoading,
} from "@shared/options/optionsSource.ts";

/** Every async dropdown's options, shared by every deal. */
@model("dealEditor/Options")
class Options extends Model({
  /** Loaded options per source and parameter (see `optionsKey`). */
  byKey: prop<Record<string, OptionsState>>(() => ({})),
  /** Loads in flight. */
  pending: prop(0),
}) {
  /** (Re)loads; resolves with the options, or `undefined` on failure. */
  async load(source: OptionsSource, param: string): Promise<readonly Option[] | undefined> {
    const key = optionsKey(source, param);
    this.started(key);
    try {
      const options = await source.load(param);
      this.finished(key, optionsLoaded(this.byKey[key], options));
      return options;
    } catch {
      this.finished(key, optionsFailed(this.byKey[key]));
      return undefined;
    }
  }

  @modelAction private started(key: string) {
    this.setState(key, optionsLoading(this.byKey[key]));
    this.pending += 1;
  }

  @modelAction private finished(key: string, state: OptionsState) {
    this.setState(key, state);
    this.pending -= 1;
  }

  /** Unchanged states come back as the same object: nothing to write, nothing notified. */
  private setState(key: string, state: OptionsState) {
    if (this.byKey[key] !== state) this.byKey[key] = state;
  }
}

export const optionsStore = new Options({});
