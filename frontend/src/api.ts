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

export type CommissionType = "Per Order" | "Percentage" | "Minimum" | "Monthly";
export const commissionTypes: CommissionType[] = ["Per Order", "Percentage", "Minimum", "Monthly"];

/** A commission or fee charged to an account (backend/app/commissions.py). amount is a decimal string. */
export interface Commission {
  id: number;
  account_id: number;
  account_name: string;
  charged_on: string; // YYYY-MM-DD
  commission_type: CommissionType;
  amount: string;
}

/** One page of commissions; total_count and total_amount cover every match, not only this page. */
export interface CommissionPage {
  items: Commission[];
  page: number;
  page_size: number;
  total_count: number;
  total_amount: string;
}

/** Filters and page for GET /api/commissions, as its query-string parameter names. Empty means unset. */
export interface CommissionQuery {
  date_from?: string;
  date_to?: string;
  commission_type?: string;
  account_id?: string;
  page?: string;
  page_size?: string;
}

export const listCommissions = (q: CommissionQuery) => {
  const params = new URLSearchParams(
    Object.entries(q).filter((kv): kv is [string, string] => Boolean(kv[1])),
  );
  const qs = params.toString();
  return request<CommissionPage>(`/api/commissions${qs ? `?${qs}` : ""}`);
};
