"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { IconSearch } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorState, TableSkeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/field";
import { api, unwrap } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useOrg } from "@/modules/shell/org-context";

import { ACTION_GROUPS, ago, dayEndUtc, dayStartUtc, describeEvent } from "../audit-format";

const PAGE_SIZE = 25;

type Filters = { action: string; actor: string; from: string; to: string };
const NONE: Filters = { action: "", actor: "", from: "", to: "" };

/**
 * SCR-20 Audit log tab (API-150, API-154; REQ-012). Only an Org Admin sees it. The date range is chosen as local days and
 * sent as UTC instants: the "to" day counts to its last millisecond, so a late evening event is inside the day it happened.
 */
export function AuditTab() {
  const org = useOrg();
  const [filters, setFilters] = useState<Filters>(NONE);
  const [page, setPage] = useState(1);
  const from = dayStartUtc(filters.from);
  const to = dayEndUtc(filters.to);
  const badRange = !!from && !!to && from > to;

  function change(next: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }

  const actors = useQuery({
    queryKey: ["audit-actors", org.id],
    queryFn: () => unwrap(api.GET("/api/v1/orgs/{org_id}/audit-events/actors", { params: { path: { org_id: org.id } } })),
  });

  const events = useQuery({
    queryKey: ["audit-events", org.id, filters.action, filters.actor, from, to, page],
    enabled: !badRange,
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(api.GET("/api/v1/orgs/{org_id}/audit-events", {
        params: {
          path: { org_id: org.id },
          query: { page, page_size: PAGE_SIZE, action: filters.action || undefined, actor_id: filters.actor || undefined, from, to },
        },
      })),
  });

  if (events.isLoading) return <TableSkeleton rows={7} />;
  if (events.isError && !events.data) {
    return <ErrorState what="the audit log" onRetry={() => void events.refetch()} requestId={isApiError(events.error) ? events.error.requestId : undefined} />;
  }
  const data = events.data;
  const first = data && data.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = data ? Math.min(page * PAGE_SIZE, data.total) : 0;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NONE);

  return (
    <section className="panel">
      <div className="filters" role="group" aria-label="Filter the audit log">
        <Select aria-label="Action" value={filters.action} onChange={(e) => change({ action: e.target.value })}>
          {ACTION_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </Select>
        <Select aria-label="Who" value={filters.actor} onChange={(e) => change({ actor: e.target.value })}>
          <option value="">Everyone</option>
          {(actors.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </Select>
        <Input type="date" aria-label="From date" value={filters.from} max={filters.to || undefined} onChange={(e) => change({ from: e.target.value })} />
        <Input type="date" aria-label="To date" value={filters.to} min={filters.from || undefined} onChange={(e) => change({ to: e.target.value })} />
        {filtered ? <Button size="sm" variant="ghost" onClick={() => change(NONE)}>Clear filters</Button> : null}
      </div>
      {badRange ? (
        <div className="state-box">
          <IconSearch className="big" />
          <h2>The end date is before the start date</h2>
          <p>Choose an end date on or after the start date.</p>
        </div>
      ) : data && data.items.length ? (
        <>
          <div className="table-wrap">
            <table className="t stackable">
              <thead>
                <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td data-label="When" className="small" style={{ whiteSpace: "nowrap" }}>
                      <span title={new Date(e.created_at).toLocaleString()}>{ago(e.created_at)}</span>
                    </td>
                    <td data-label="Who" className="small">{e.actor_name ?? "System"}</td>
                    <td data-label="Action"><span className="mono small">{e.action}</span></td>
                    <td data-label="Details" className="small">{describeEvent(e.action, e.data, e.target_name)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <span className="grow" role="status">Showing {first} to {last} of {data.total}</span>
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button size="sm" disabled={last >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </>
      ) : (
        <div className="state-box">
          <IconSearch className="big" />
          <h2>{filtered ? "No events match these filters" : "Nothing in the audit log yet"}</h2>
          <p>{filtered ? "Try a wider date range or another action." : "Changes to members, settings and bugs appear here as they happen."}</p>
        </div>
      )}
    </section>
  );
}
