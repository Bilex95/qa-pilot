"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

import { useComponents, useEnvironments, useLabelOptions, useMemberOptions, useProjects } from "../hooks";
import { hasActiveFilters, PRIORITY_OPTIONS, SEVERITY_OPTIONS, STATUS_OPTIONS, type FilterState } from "../schemas";

type Props = {
  filters: FilterState;
  search: string;
  onSearch: (value: string) => void;
  onChange: (patch: Partial<FilterState>) => void;
  onClear: () => void;
};

/**
 * The filter row of SCR-08. The five controls of the prototype stay the visible row (search, project, status, severity,
 * assignee); priority, component, environment and label sit behind "More filters" (product owner, I-03).
 */
export function BugFilters({ filters, search, onSearch, onChange, onClear }: Props) {
  const projects = useProjects();
  const members = useMemberOptions();
  const labels = useLabelOptions();
  const components = useComponents(filters.project || undefined);
  const environments = useEnvironments(filters.project || undefined);
  const extraCount = [filters.priority, filters.component, filters.environment, filters.label].filter(Boolean).length;
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = moreOpen || extraCount > 0;
  const assignable = (members.data?.items ?? []).filter((m) => m.role !== "viewer");

  return (
    <>
      <div className="filters" role="search">
        <label className="sr-only" htmlFor="f-q">Search</label>
        <Input id="f-q" className="search-f" type="search" placeholder="Search key, title or description" value={search}
          autoComplete="off" maxLength={200} onChange={(e) => onSearch(e.target.value)} />
        <label className="sr-only" htmlFor="f-p">Project</label>
        <Select id="f-p" value={filters.project}
          onChange={(e) => onChange({ project: e.target.value, component: "", environment: "" })}>
          <option value="">All projects</option>
          {(projects.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <label className="sr-only" htmlFor="f-s">Status</label>
        <Select id="f-s" value={filters.status} onChange={(e) => onChange({ status: e.target.value })}>
          <option value="open">All open</option>
          <option value="any">Any status</option>
          {STATUS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <label className="sr-only" htmlFor="f-v">Severity</label>
        <Select id="f-v" value={filters.severity} onChange={(e) => onChange({ severity: e.target.value })}>
          <option value="">Any severity</option>
          {SEVERITY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <label className="sr-only" htmlFor="f-a">Assignee</label>
        <Select id="f-a" value={filters.assignee} onChange={(e) => onChange({ assignee: e.target.value })}>
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {assignable.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>)}
        </Select>
        <Button size="sm" aria-expanded={showMore} aria-controls="more-filters" onClick={() => setMoreOpen(!showMore)}>
          More filters{extraCount ? ` (${extraCount})` : ""}
        </Button>
        {hasActiveFilters(filters) || search.trim() ? (
          <Button variant="ghost" size="sm" onClick={onClear}>Clear filters</Button>
        ) : null}
      </div>
      {showMore ? (
        <div className="filters" id="more-filters" role="group" aria-label="More filters">
          <label className="sr-only" htmlFor="f-pri">Priority</label>
          <Select id="f-pri" value={filters.priority} onChange={(e) => onChange({ priority: e.target.value })}>
            <option value="">Any priority</option>
            {PRIORITY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <label className="sr-only" htmlFor="f-c">Component</label>
          <Select id="f-c" value={filters.component} disabled={!filters.project}
            title={filters.project ? undefined : "Choose a project to filter by component"}
            onChange={(e) => onChange({ component: e.target.value })}>
            <option value="">{filters.project ? "Any component" : "Component (choose a project)"}</option>
            {(components.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <label className="sr-only" htmlFor="f-e">Environment</label>
          <Select id="f-e" value={filters.environment} disabled={!filters.project}
            title={filters.project ? undefined : "Choose a project to filter by environment"}
            onChange={(e) => onChange({ environment: e.target.value })}>
            <option value="">{filters.project ? "Any environment" : "Environment (choose a project)"}</option>
            {(environments.data ?? []).map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
          </Select>
          <label className="sr-only" htmlFor="f-l">Label</label>
          <Select id="f-l" value={filters.label} onChange={(e) => onChange({ label: e.target.value })}>
            <option value="">Any label</option>
            {(labels.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>
      ) : null}
    </>
  );
}
