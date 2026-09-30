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

const dealColumn = () => screen.getByRole("region", { name: "Deal column" });
const dealCode = () => within(dealColumn()).getByLabelText("Notional Ccy");

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
    await user.clear(dealCode());
    await user.type(dealCode(), "EDIT");
    await user.click(screen.getByRole("button", { name: "Add New Deal" }));
    expect((dealCode() as HTMLInputElement).value).toBe("BASE");
    await user.click(screen.getByRole("button", { name: "Tab 1" }));
    expect((dealCode() as HTMLInputElement).value).toBe("EDIT");
    expect(screen.getByRole("status", { name: "Deal status" }).textContent).toContain("1 product");
  });

  it("links shared inputs and supports repeatable empty broadcasts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Add New Product" }));
    const firstRow = screen.getByRole("region", { name: "Product 1" });
    const secondRow = screen.getByRole("region", { name: "Product 2" });
    await user.clear(within(firstRow).getByLabelText("Notional Ccy"));
    await user.type(within(firstRow).getByLabelText("Notional Ccy"), "SAME");
    expect((within(secondRow).getByLabelText("Notional Ccy") as HTMLInputElement).value).toBe("SAME");
    const broadcast = within(dealColumn()).getByLabelText("Strike");
    await user.type(broadcast, "123{Enter}");
    expect((within(secondRow).getByLabelText("Strike") as HTMLInputElement).value).toBe("123");
    await user.type(broadcast, "x");
    await user.clear(broadcast);
    await user.keyboard("{Enter}");
    expect((within(firstRow).getByLabelText("Strike") as HTMLInputElement).value).toBe("");
  });

  it("keeps rendered product columns bounded when 1,000 products are added", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add 1,000 Products" }));
    expect(screen.getByRole("status", { name: "Deal status" }).textContent).toContain("1,001 products");
    const rendered = screen.getAllByRole("region", { name: /^Product \d+$/ });
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
      fireEvent.click(screen.getByRole("button", { name: "Add New Deal" }));
      expect(vi.getTimerCount()).toBe(1);
      fireEvent.click(screen.getByRole("button", { name: "Tab 1" }));
      expect(vi.getTimerCount()).toBe(1);
      fireEvent.click(screen.getByRole("button", { name: "Toggle Spot Price Stream (Enabled)" }));
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
      fireEvent.change(dealCode(), { target: { value: "EDIT" } });
      fireEvent.click(screen.getByRole("button", { name: "Close Tab 1" }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect((dealCode() as HTMLInputElement).value).toBe("EDIT");
    } finally {
      confirm.mockRestore();
    }
  });

  it("preserves the parent hierarchy with shared controls in the leading deal column", () => {
    render(<App />);
    const parent = dealColumn();
    const product = screen.getByRole("region", { name: "Product 1" });
    expect(within(parent).getByRole("heading", { name: "Deal Column" })).toBeTruthy();
    expect(within(product).getByRole("heading", { name: "Product Column 1" })).toBeTruthy();
    expect(within(parent).getByLabelText("Notional Ccy")).toBeTruthy();
    expect(within(parent).getByLabelText("Premium Ccy")).toBeTruthy();
    expect(within(parent).getByLabelText("Strike")).toBeTruthy();
    expect(within(parent).getByLabelText("Spot Stream")).toBeTruthy();
    expect(parent.compareDocumentPosition(product) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps deal controls mounted while virtualized products scroll and receive broadcasts", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add 1,000 Products" }));
    const parent = dealColumn();
    const broadcast = within(parent).getByLabelText("Strike");
    fireEvent.change(broadcast, { target: { value: "123" } });
    const viewport = screen.getByLabelText("Deal and product columns");
    const height = parseFloat((viewport.firstElementChild as HTMLElement).style.height);
    fireEvent.scroll(viewport, { target: { scrollTop: height - 540 } });
    expect(dealColumn()).toBe(parent);
    fireEvent.keyDown(broadcast, { key: "Enter" });
    const last = screen.getByRole("region", { name: "Product 1001" });
    expect((within(last).getByLabelText("Strike") as HTMLInputElement).value).toBe("123");
    fireEvent.change(within(last).getByLabelText("Strike"), { target: { value: "999" } });
    fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
    fireEvent.scroll(viewport, { target: { scrollTop: height - 540 } });
    expect((within(screen.getByRole("region", { name: "Product 1001" })).getByLabelText("Strike") as HTMLInputElement).value).toBe("999");
  });
});
