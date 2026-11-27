"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconBug, IconPlus, IconSearch } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/feedback";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { useOrg } from "@/modules/shell/org-context";

import { BugFilters } from "./components/bug-filters";
import { BugTable } from "./components/bug-table";
import { SavedViews } from "./components/saved-views";
import { DEFAULT_FILTERS, PAGE_SIZE, parseFilters, sameFilters, toApiQuery, toSearch, type FilterState } from "./schemas";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * SCR-08 Bug list (API-060, API-078 to API-080; REQ-026, REQ-027, REQ-041). The filter state lives in the URL query
 * string; the search box is debounced into it. Everyone who can read bugs sees the list (bug.read: all roles).
 */
export function BugsPage() {
  const org = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const [search, setSearch] = useState(filters.q);
  const debounced = useDebounced(search.trim(), 300);
  const pushedQ = useRef(filters.q); // the search text this screen last wrote to the URL
  const typed = useRef(false); // true while the box holds typing that has not reached the URL yet

  // Every change that is not typing (a filter, a view, Clear filters, a page) goes through here and drops pending typing,
  // so a search that settles late can never overwrite the choice that was made after it
  const go = (next: FilterState, how: "replace" | "push" = "replace") => {
    typed.current = false;
    router[how](`${pathname}${toSearch(next)}`);
  };
  const change = (patch: Partial<FilterState>) => go({ ...filters, page: 1, ...patch });
  const onSearch = (value: string) => {
    typed.current = true;
    setSearch(value);
  };

  // search box -> URL, only for text that was typed
  useEffect(() => {
    if (!typed.current || debounced === filters.q) return;
    typed.current = false;
    pushedQ.current = debounced;
    router.replace(`${pathname}${toSearch({ ...filters, q: debounced, page: 1 })}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a settled search text should write to the URL
  }, [debounced]);
  // URL -> search box, when something else changed it (a view, Clear filters, the back button)
  useEffect(() => {
    if (filters.q === pushedQ.current) return;
    pushedQ.current = filters.q;
    setSearch(filters.q);
  }, [filters.q]);

  const query = toApiQuery(filters);
  const bugs = useQuery({
    queryKey: ["bugs", org.id, query],
    placeholderData: keepPreviousData, // keep the table (and the focus in the search box) while the next page loads
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/bugs", { params: { path: { org_id: org.id }, query } })),
  });
  const data = bugs.data;
  const isDefault = sameFilters(filters, DEFAULT_FILTERS) && filters.q === "";

  // With no open bugs and no filters, tell "nothing was ever reported" from "everything is finished"
  const anyBug = useQuery({
    queryKey: ["bugs", org.id, "any-exists"],
    enabled: !!data && data.total === 0 && isDefault,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/bugs", { params: { path: { org_id: org.id }, query: { page: 1, page_size: 1 } } })),
  });

  // A page past the end (bugs were deleted meanwhile) goes back to the last page that exists
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && filters.page > lastPage) {
      router.replace(`${pathname}${toSearch({ ...filters, page: lastPage })}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to a new result
  }, [data]);

  const report = can(org.role, "bug.create") ? (
    <Link className="btn primary" href={`/o/${encodeURIComponent(org.slug)}/bugs/new`}>
      <IconPlus />
      Report bug
    </Link>
  ) : null;

  const head = (
    <div className="page-head">
      <div className="grow">
        <h1>Bugs</h1>
        <p>Every bug across your projects. Filter, search and save views.</p>
      </div>
      {report ? <div className="actions">{report}</div> : null}
    </div>
  );

  if (bugs.isPending) {
    return (
      <>
        {head}
        <TableSkeleton />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {head}
        <ErrorState what="bugs" onRetry={() => void bugs.refetch()}
          requestId={isApiError(bugs.error) ? bugs.error.requestId : undefined} />
      </>
    );
  }
  if (data.total === 0 && isDefault && anyBug.data?.total === 0) {
    return (
      <>
        {head}
        <EmptyState icon={IconBug} title="No bugs yet" action={report}>
          {report ? "Report the first bug, or let a failed test step create it." : "Bugs reported by your team will appear here."}
        </EmptyState>
      </>
    );
  }

  const first = (filters.page - 1) * PAGE_SIZE + 1;
  const last = first + data.items.length - 1;

  return (
    <>
      {head}
      <section className="panel" id="bug-panel">
        <SavedViews filters={filters} onApply={(next) => go(next)} />
        <BugFilters filters={filters} search={search} onSearch={onSearch} onChange={change}
          onClear={() => { setSearch(""); go({ ...DEFAULT_FILTERS, sort: filters.sort }); }} />
        {data.items.length ? (
          <>
            <BugTable items={data.items} sort={filters.sort} onSort={(sort) => change({ sort })} />
            <div className="pager">
              <span className="grow" role="status">Showing {first} to {last} of {data.total}</span>
              <Button size="sm" disabled={filters.page <= 1} onClick={() => go({ ...filters, page: filters.page - 1 }, "push")}>Previous</Button>
              <Button size="sm" disabled={last >= data.total} onClick={() => go({ ...filters, page: filters.page + 1 }, "push")}>Next</Button>
            </div>
          </>
        ) : (
          <div className="state-box">
            <IconSearch className="big" />
            <h2>{isDefault ? "No open bugs" : "No bugs match these filters"}</h2>
            <p>
              {isDefault
                ? "Everything is verified, closed or won't fix. Choose Any status to see those too."
                : "Try a different search or clear the filters to see every open bug."}
            </p>
            {isDefault ? null : (
              <Button onClick={() => { setSearch(""); go({ ...DEFAULT_FILTERS, sort: filters.sort }); }}>Clear filters</Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
