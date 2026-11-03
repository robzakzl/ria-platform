import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Account } from "../api";
import App from "../App";

const ada: Account = {
  id: 1,
  first_name: "Ada",
  last_name: "Lovelace",
  address: { street1: "1 Main St", street2: "Apt 4", city: "Boston", state: "MA", zip: "02110" },
  account_type: "IRA",
  cash_balance: "1234.5",
};

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

let fetchMock: ReturnType<typeof vi.fn>;
let created: Account | undefined;

beforeEach(() => {
  created = undefined;
  fetchMock = vi.fn((path: string, init?: RequestInit) => {
    if (path === "/api/accounts" && init?.method === "POST") {
      created = { ...JSON.parse(String(init.body)), id: 51 };
      return json(201, created);
    }
    if (path === "/api/accounts") return json(200, [ada]);
    if (path === "/api/accounts/1") return json(200, ada);
    if (path === "/api/accounts/51" && created) return json(200, created);
    return json(404, { detail: "account not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the Accounts page lists accounts with their ID, name, type, city and cash balance", async () => {
  window.location.hash = "";
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "Accounts" }));
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Accounts");
  const row = (await screen.findByRole("link", { name: "Lovelace, Ada" })).closest("tr")!;
  expect([...row.querySelectorAll("td")].map((td) => td.textContent)).toEqual([
    "1",
    "Lovelace, Ada",
    "IRA",
    "Boston, MA",
    "$1,234.50",
  ]);
});

test("an account's detail page shows every field", async () => {
  window.location.hash = "#/accounts/1";
  render(<App />);
  expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Ada Lovelace");
  const text = document.querySelector(".details")!.textContent;
  for (const s of ["1", "Ada", "Lovelace", "IRA", "$1,234.50", "1 Main St", "Apt 4", "Boston, MA 02110"])
    expect(text).toContain(s);
  expect(screen.getByRole("link", { name: "Accounts" }).getAttribute("aria-current")).toBe("page");
});

test("an unknown account says so", async () => {
  window.location.hash = "#/accounts/9";
  render(<App />);
  expect((await screen.findByRole("alert")).textContent).toContain("account not found");
});

test("the list shows an error when the API fails", async () => {
  fetchMock.mockImplementation(() => json(503, { detail: "database unreachable" }));
  window.location.hash = "#/accounts";
  render(<App />);
  expect((await screen.findByRole("alert")).textContent).toContain("database unreachable");
});

test("adding an account posts it and opens the new account", async () => {
  window.location.hash = "#/accounts/new";
  render(<App />);
  const form = document.querySelector("form")!;
  const fill = (label: string, value: string) =>
    fireEvent.change(within(form).getByLabelText(label), { target: { value } });
  fill("First name", "Grace");
  fill("Last name", "Hopper");
  fill("Street", "2 Navy Way");
  fill("City", "Arlington");
  fill("State", "VA");
  fill("ZIP code", "22201");
  fill("Account type", "Joint");
  fill("Cash balance (USD)", "500");
  fireEvent.submit(form);

  expect(await screen.findByRole("heading", { level: 1, name: "Grace Hopper" })).toBeTruthy();
  const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === "POST")!;
  expect(JSON.parse(init.body)).toEqual({
    first_name: "Grace",
    last_name: "Hopper",
    address: { street1: "2 Navy Way", street2: null, city: "Arlington", state: "VA", zip: "22201" },
    account_type: "Joint",
    cash_balance: "500",
  });
  expect(window.location.hash).toBe("#/accounts/51");
});
