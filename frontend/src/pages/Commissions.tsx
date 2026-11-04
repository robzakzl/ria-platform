import { Link, useSearchParams } from "react-router";
import { commissionTypes, formatUsd, listAccounts, listCommissions } from "../api";
import { useLoad } from "../useLoad";

const PAGE_SIZE = 25;

// Filter fields, kept in the page URL (#/commissions?type=Monthly&page=2) so a filtered view can be
// reloaded or shared. Keys are the API's query parameters.
const FILTERS = ["date_from", "date_to", "commission_type", "account_id"] as const;
type Filter = (typeof FILTERS)[number];

const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
/** "2026-10-03" -> "Oct 3, 2026", read as a calendar date (no time-zone shift). */
const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return longDate.format(new Date(y, m - 1, d));
};

/** Commissions page: every commission and fee charged to accounts, filtered and paged. */
export default function Commissions() {
  const [params, setParams] = useSearchParams();
  const value = (k: Filter) => params.get(k) ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = {
    ...Object.fromEntries(FILTERS.map((k) => [k, value(k)])),
    page: String(page),
    page_size: String(PAGE_SIZE),
  };
  const result = useLoad(() => listCommissions(query), JSON.stringify(query));
  const accounts = useLoad(listAccounts, "all");

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };
  // A changed filter starts again at page 1.
  const setFilter = (k: Filter) => (e: { target: { value: string } }) =>
    update({ [k]: e.target.value, page: "" });
  const filtered = FILTERS.some((k) => value(k));

  return (
    <>
      <div className="page-head">
        <h1>Commissions</h1>
      </div>
      <form className="filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
        <label className="field">
          <span>From</span>
          <input type="date" value={value("date_from")} onChange={setFilter("date_from")} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={value("date_to")} onChange={setFilter("date_to")} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={value("commission_type")} onChange={setFilter("commission_type")}>
            <option value="">All types</option>
            {commissionTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Account</span>
          <select value={value("account_id")} onChange={setFilter("account_id")}>
            <option value="">All accounts</option>
            {accounts.state === "ok" &&
              accounts.data.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.last_name}, {a.first_name} ({a.id})
                </option>
              ))}
          </select>
        </label>
        {filtered && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setParams(new URLSearchParams())}
          >
            Clear filters
          </button>
        )}
      </form>
      {result.state === "loading" && <p className="muted">Loading commissions…</p>}
      {result.state === "error" && (
        <p className="error" role="alert">
          Could not load commissions: {result.message}
        </p>
      )}
      {result.state === "ok" && (
        <>
          <p className="summary">
            <strong>{result.data.total_count.toLocaleString("en-US")}</strong>{" "}
            {result.data.total_count === 1 ? "charge" : "charges"}, totalling{" "}
            <strong>{formatUsd(result.data.total_amount)}</strong>
          </p>
          {result.data.items.length === 0 ? (
            <p className="muted">
              {result.data.total_count === 0
                ? "No commissions match these filters."
                : "This page is past the last one."}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col" className="wide-only">
                      Account ID
                    </th>
                    <th scope="col">Account</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="num">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((c) => (
                    <tr key={c.id}>
                      <td>{formatDate(c.charged_on)}</td>
                      <td className="wide-only">{c.account_id}</td>
                      <td>
                        <Link to={`/accounts/${c.account_id}`}>{c.account_name}</Link>
                      </td>
                      <td>{c.commission_type}</td>
                      <td className="num">{formatUsd(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={page}
            pages={Math.max(1, Math.ceil(result.data.total_count / PAGE_SIZE))}
            go={(p) => update({ page: p === 1 ? "" : String(p) })}
          />
        </>
      )}
    </>
  );
}

function Pager({ page, pages, go }: { page: number; pages: number; go: (page: number) => void }) {
  if (pages <= 1 && page === 1) return null;
  return (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="button" disabled={page <= 1} onClick={() => go(page - 1)}>
        ← Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" className="button" disabled={page >= pages} onClick={() => go(page + 1)}>
        Next →
      </button>
    </nav>
  );
}
