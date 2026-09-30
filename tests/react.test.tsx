import { Profiler, StrictMode } from "react";
import { Provider } from "jotai/react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.tsx";
import { TextInput } from "../src/components/TextInput.tsx";
import { LiveValueField } from "../src/components/LiveValueField.tsx";
import { createWorkspace } from "../src/state/workspace.ts";
import { createLiveValue, type LiveSource } from "../src/state/liveValue.ts";
import { manualFrames } from "./helpers.ts";

beforeEach(() => localStorage.clear());

describe("React editor", () => {
  it("commits only the edited input among 1,000 subscribed inputs", () => {
    const workspace = createWorkspace();
    workspace.actions.addRows(999);
    const rows = workspace.store.get(workspace.rows);
    const commits = Array<number>(rows.length).fill(0);
    render(<Provider store={workspace.store}>{rows.map((row, i) => <Profiler key={row.id} id={row.id} onRender={() => commits[i]++}><TextInput field={row.level} label={`Field ${i}`} /></Profiler>)}</Provider>);
    commits.fill(0);
    fireEvent.change(screen.getByLabelText("Field 500"), { target: { value: "123" } });
    expect(commits[500]).toBe(1);
    expect(commits.reduce((sum, count) => sum + count, 0)).toBe(1);
  });

  it("preserves edits through tab switches without adding rows on remount", async () => {
    const user = userEvent.setup();
    render(<StrictMode><App /></StrictMode>);
    await user.clear(screen.getByLabelText("Shared base code"));
    await user.type(screen.getByLabelText("Shared base code"), "EDIT");
    await user.click(screen.getByRole("button", { name: "New workspace" }));
    expect((screen.getByLabelText("Shared base code") as HTMLInputElement).value).toBe("BASE");
    await user.click(screen.getByRole("button", { name: "Workspace 1" }));
    expect((screen.getByLabelText("Shared base code") as HTMLInputElement).value).toBe("EDIT");
    expect(screen.getByRole("status", { name: "Workspace status" }).textContent).toContain("1 rows");
  });

  it("links shared inputs and supports repeatable empty broadcasts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Add row" }));
    const firstRow = screen.getByRole("region", { name: "Row 1" });
    const secondRow = screen.getByRole("region", { name: "Row 2" });
    await user.clear(within(firstRow).getByLabelText("Base code"));
    await user.type(within(firstRow).getByLabelText("Base code"), "SAME");
    expect((within(secondRow).getByLabelText("Base code") as HTMLInputElement).value).toBe("SAME");
    const broadcast = screen.getByLabelText("Apply level to all rows");
    await user.type(broadcast, "123{Enter}");
    expect((within(secondRow).getByLabelText("Level") as HTMLInputElement).value).toBe("123");
    await user.type(broadcast, "x");
    await user.clear(broadcast);
    await user.keyboard("{Enter}");
    expect((within(firstRow).getByLabelText("Level") as HTMLInputElement).value).toBe("");
  });

  it("keeps rendered rows bounded when 1,000 rows are added", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add 1,000 rows" }));
    expect(screen.getByRole("status", { name: "Workspace status" }).textContent).toContain("1,001 rows");
    const rendered = screen.getAllByRole("region", { name: /^Row \d+$/ });
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(25);
  });

  it("cleans live sources under Strict Mode, toggle, tab change and unmount", () => {
    const frames = manualFrames();
    const channel = createLiveValue(frames.scheduler);
    let active = 0;
    let callback!: (value: number) => void;
    const stop = vi.fn(() => active--);
    const source: LiveSource = (next) => { active++; callback = next; return stop; };
    const view = render(<StrictMode><LiveValueField channel={channel} source={source} enabled /></StrictMode>);
    expect(active).toBe(1);
    expect(stop).toHaveBeenCalledTimes(1);
    act(() => { for (let i = 1; i <= 10_000; i++) callback(i); frames.flush(); });
    expect(screen.getByLabelText("Live value").textContent).toBe("10,000");
    view.rerender(<StrictMode><LiveValueField channel={channel} source={source} enabled={false} /></StrictMode>);
    expect(active).toBe(0);
    view.unmount();
    callback(123);
    expect(channel.getLatest()).toBe(10_000);
    expect(frames.size()).toBe(0);
  });

  it("runs one timer for the active workspace and none after pause or unmount", () => {
    vi.useFakeTimers();
    try {
      const view = render(<StrictMode><App /></StrictMode>);
      expect(vi.getTimerCount()).toBe(1);
      fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
      expect(vi.getTimerCount()).toBe(1);
      fireEvent.click(screen.getByRole("button", { name: "Workspace 1" }));
      expect(vi.getTimerCount()).toBe(1);
      fireEvent.click(screen.getByRole("button", { name: "Live updates: on" }));
      expect(vi.getTimerCount()).toBe(0);
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a modified workspace open when discarding changes is declined", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      render(<App />);
      fireEvent.change(screen.getByLabelText("Shared base code"), { target: { value: "EDIT" } });
      fireEvent.click(screen.getByRole("button", { name: "Close Workspace 1" }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect((screen.getByLabelText("Shared base code") as HTMLInputElement).value).toBe("EDIT");
    } finally {
      confirm.mockRestore();
    }
  });
});
