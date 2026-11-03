// Where the API lives. Empty (same origin, the default) locally; the deployed build, served by GitHub
// Pages, sets VITE_API_BASE_URL to the API's own HTTPS URL at build time (scripts/deploy.sh).
export const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export type AccountType = "IRA" | "Standard" | "Joint";
export const accountTypes: AccountType[] = ["IRA", "Standard", "Joint"];

export interface Address {
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
}

/** An account as the API sends it (backend/app/accounts.py). cash_balance is a decimal string. */
export interface Account {
  id: number;
  first_name: string;
  last_name: string;
  address: Address;
  account_type: AccountType;
  cash_balance: string;
}

export type NewAccount = Omit<Account, "id">;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const formatUsd = (amount: string) => usd.format(Number(amount));

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(apiBase + path, init);
  if (!r.ok) {
    let detail = `${r.status}`;
    try {
      const body = await r.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail))
        detail = body.detail
          .map((e: { loc: string[]; msg: string }) => `${e.loc.slice(1).join(".")}: ${e.msg}`)
          .join("; ");
    } catch {
      // not JSON; keep the status
    }
    throw new Error(detail);
  }
  return r.json() as Promise<T>;
}

export const listAccounts = () => request<Account[]>("/api/accounts");
export const getAccount = (id: string) => request<Account>(`/api/accounts/${encodeURIComponent(id)}`);
export const createAccount = (a: NewAccount) =>
  request<Account>("/api/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(a),
  });
