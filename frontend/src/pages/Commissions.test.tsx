import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Account, Commission } from "../api";
import App from "../App";

const ada = { id: 3, first_name: "Ada", last_name: "Lovelace" } as Account;

const charge = (id: number): Commission => ({
  id,
  account_id: 3,
  account_name: "Ada Lovelace",
  charged_on: "2026-10-03",
  commission_type: "Per Order",
  amount: "12.5",
});

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.location.hash = "#/commissions";
  fetchMock = vi.fn((path: string) => {
    if (path === "/api/accounts") return json([ada]);
    const q = new URL(path, "http://x").searchParams;
    const page = Number(q.get("page"));
    return json({
      items: [charge(page)],
      page,
      page_size: 25,
      total_count: 60,
      total_amount: "1234.5",
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const lastQuery = () =>
  new URL(fetchMock.mock.calls.filter(([p]) => p.startsWith("/api/commissions")).at(-1)![0], "http://x")
    .searchParams;

test("the Commissions page lists charges with their total", async () => {
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Commissions");
  const row = (await screen.findByRole("link", { name: "Ada Lovelace" })).closest("tr")!;
  expect([...row.querySelectorAll("td")].map((td) => td.textContent)).toEqual([
    "Oct 3, 2026",
    "3",
    "Ada Lovelace",
    "Per Order",
    "$12.50",
  ]);
  expect(document.querySelector(".summary")!.textContent).toBe("60 charges, totalling $1,234.50");
  expect(lastQuery().get("page")).toBe("1");
  expect(lastQuery().get("page_size")).toBe("25");
});

test("filters are sent to the API and reset the page", async () => {
  render(<App />);
  await screen.findByText("Page 1 of 3");
  fireEvent.click(screen.getByRole("button", { name: "Next →" }));
  await screen.findByText("Page 2 of 3");
  expect(lastQuery().get("page")).toBe("2");

  const filters = screen.getByRole("form", { name: "Filters" });
  fireEvent.change(within(filters).getByLabelText("From"), { target: { value: "2026-06-01" } });
  fireEvent.change(within(filters).getByLabelText("To"), { target: { value: "2026-06-30" } });
  fireEvent.change(within(filters).getByLabelText("Type"), { target: { value: "Monthly" } });
  await screen.findByRole("option", { name: "Lovelace, Ada (3)" });
  fireEvent.change(within(filters).getByLabelText("Account"), { target: { value: "3" } });
  await screen.findByText("Page 1 of 3");
  const q = lastQuery();
  expect(q.get("date_from")).toBe("2026-06-01");
  expect(q.get("date_to")).toBe("2026-06-30");
  expect(q.get("commission_type")).toBe("Monthly");
  expect(q.get("account_id")).toBe("3");
  expect(q.get("page")).toBe("1");

  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await screen.findByText("Page 1 of 3");
  expect([...lastQuery().keys()].sort()).toEqual(["page", "page_size"]);
});

test("the type filter offers every commission type", () => {
  render(<App />);
  const options = within(screen.getByLabelText("Type")).getAllByRole("option");
  expect(options.map((o) => o.textContent)).toEqual([
    "All types",
    "Per Order",
    "Percentage",
    "Minimum",
    "Monthly",
  ]);
});

test("Previous is disabled on the first page and Next on the last", async () => {
  window.location.hash = "#/commissions?page=3";
  render(<App />);
  await screen.findByText("Page 3 of 3");
  expect(screen.getByRole("button", { name: "Next →" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "← Previous" }).hasAttribute("disabled")).toBe(false);
});
