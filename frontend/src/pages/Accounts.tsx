import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  type Account,
  type AccountType,
  accountTypes,
  createAccount,
  formatUsd,
  getAccount,
  listAccounts,
} from "../api";
import { useLoad } from "../useLoad";

const fullName = (a: Account) => `${a.first_name} ${a.last_name}`;

/** Accounts page: every account in a table, each linking to its detail page. */
export function AccountList() {
  const result = useLoad(listAccounts, "all");
  return (
    <>
      <div className="page-head">
        <h1>Accounts</h1>
        <Link className="button" to="/accounts/new">
          Add account
        </Link>
      </div>
      {result.state === "loading" && <p className="muted">Loading accounts…</p>}
      {result.state === "error" && (
        <p className="error" role="alert">
          Could not load accounts: {result.message}
        </p>
      )}
      {result.state === "ok" && result.data.length === 0 && <p className="muted">No accounts yet.</p>}
      {result.state === "ok" && result.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col" className="wide-only">
                  City
                </th>
                <th scope="col" className="num">
                  Cash balance
                </th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>
                    <Link to={`/accounts/${a.id}`}>
                      {a.last_name}, {a.first_name}
                    </Link>
                  </td>
                  <td>{a.account_type}</td>
                  <td className="wide-only">
                    {a.address.city}, {a.address.state}
                  </td>
                  <td className="num">{formatUsd(a.cash_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">{result.data.length} accounts</p>
        </div>
      )}
    </>
  );
}

/** One account's full details. */
export function AccountDetail() {
  const { id = "" } = useParams();
  const result = useLoad(() => getAccount(id), id);
  return (
    <>
      <p>
        <Link to="/accounts">← All accounts</Link>
      </p>
      {result.state === "loading" && <p className="muted">Loading account…</p>}
      {result.state === "error" && (
        <>
          <h1>Account {id}</h1>
          <p className="error" role="alert">
            Could not load this account: {result.message}
          </p>
        </>
      )}
      {result.state === "ok" && <AccountCard account={result.data} />}
    </>
  );
}

function AccountCard({ account: a }: { account: Account }) {
  const ad = a.address;
  return (
    <>
      <h1>{fullName(a)}</h1>
      <dl className="details">
        <dt>Account ID</dt>
        <dd>{a.id}</dd>
        <dt>First name</dt>
        <dd>{a.first_name}</dd>
        <dt>Last name</dt>
        <dd>{a.last_name}</dd>
        <dt>Account type</dt>
        <dd>{a.account_type}</dd>
        <dt>Cash balance</dt>
        <dd>{formatUsd(a.cash_balance)}</dd>
        <dt>Address</dt>
        <dd>
          <address>
            {ad.street1}
            {ad.street2 && (
              <>
                <br />
                {ad.street2}
              </>
            )}
            <br />
            {ad.city}, {ad.state} {ad.zip}
          </address>
        </dd>
      </dl>
    </>
  );
}

const blank = {
  first_name: "",
  last_name: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  account_type: "Standard" as AccountType,
  cash_balance: "0.00",
};

/** The form that stores a new account, then opens it. */
export function NewAccountForm() {
  const navigate = useNavigate();
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    createAccount({
      first_name: f.first_name,
      last_name: f.last_name,
      address: {
        street1: f.street1,
        street2: f.street2.trim() || null,
        city: f.city,
        state: f.state,
        zip: f.zip,
      },
      account_type: f.account_type,
      cash_balance: f.cash_balance,
    })
      .then((a) => navigate(`/accounts/${a.id}`))
      .catch((err: Error) => {
        setError(err.message);
        setSaving(false);
      });
  };

  const field = (k: keyof typeof blank, label: string, props: object = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={f[k]} onChange={set(k)} required {...props} />
    </label>
  );

  return (
    <>
      <p>
        <Link to="/accounts">← All accounts</Link>
      </p>
      <h1>Add account</h1>
      <form className="form" onSubmit={submit}>
        <fieldset>
          <legend>Account holder</legend>
          {field("first_name", "First name", { autoComplete: "off", maxLength: 200 })}
          {field("last_name", "Last name", { autoComplete: "off", maxLength: 200 })}
        </fieldset>
        <fieldset>
          <legend>Address</legend>
          {field("street1", "Street", { maxLength: 200 })}
          {field("street2", "Apartment, suite (optional)", { required: false, maxLength: 200 })}
          {field("city", "City", { maxLength: 200 })}
          <div className="row">
            {field("state", "State", {
              maxLength: 2,
              pattern: "[A-Za-z]{2}",
              title: "Two-letter state code, e.g. MA",
            })}
            {field("zip", "ZIP code", {
              pattern: "\\d{5}(-\\d{4})?",
              title: "Five digits, or ZIP+4 (12345-6789)",
              inputMode: "numeric",
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend>Account</legend>
          <label className="field">
            <span>Account type</span>
            <select value={f.account_type} onChange={set("account_type")}>
              {accountTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {field("cash_balance", "Cash balance (USD)", {
            type: "number",
            step: "0.01",
            inputMode: "decimal",
          })}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            Could not save: {error}
          </p>
        )}
        <div>
          <button type="submit" className="button" disabled={saving}>
            {saving ? "Saving…" : "Save account"}
          </button>
        </div>
      </form>
    </>
  );
}
