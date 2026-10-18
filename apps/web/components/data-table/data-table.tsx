"use client";

import { useId, useState, type ReactNode } from "react";
import {
  queryRows,
  type SortDirection,
  type SortValue,
} from "../../lib/demo/table";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import { Button } from "../ui/button";
import { EmptyState } from "../shared/empty-state";

export type TableColumn<T> = {
  key: string;
  label: string;
  get: (record: T) => SortValue;
  render?: (record: T) => ReactNode;
};
export type TableFilter<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  get: (record: T) => string;
};

export function DataTable<T extends { id: string }>({
  records,
  columns,
  filters = [],
  actions,
  label,
  searchText,
  initialVisibleColumns,
}: {
  records: readonly T[];
  columns: TableColumn<T>[];
  filters?: TableFilter<T>[];
  actions: (record: T) => ReactNode;
  label: string;
  searchText: (record: T) => string;
  initialVisibleColumns?: string[];
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState(
    initialVisibleColumns?.[0] ?? columns[0]?.key ?? "",
  );
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [hidden, setHidden] = useState<string[]>(() =>
    initialVisibleColumns
      ? columns
          .filter((column) => !initialVisibleColumns.includes(column.key))
          .map((column) => column.key)
      : [],
  );
  const sortColumn = columns.find((column) => column.key === sortKey);
  const result = queryRows(records, {
    search,
    searchText,
    page,
    pageSize,
    filters: filters.map((filter) => ({
      value: selected[filter.key] ?? "",
      get: filter.get,
    })),
    sort: sortColumn ? { get: sortColumn.get, direction } : undefined,
  });
  const visible = columns.filter((column) => !hidden.includes(column.key));
  function reset() {
    setSearch("");
    setSelected({});
    setPage(1);
  }
  function sort(key: string) {
    setDirection(key === sortKey && direction === "asc" ? "desc" : "asc");
    setSortKey(key);
    setPage(1);
  }
  return (
    <div className="min-w-0 space-y-5">
      <div className="grid items-end gap-4 rounded-xl border border-border bg-background p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label htmlFor={`${id}-search`}>
            Buscar em {label.toLowerCase()}
          </Label>
          <Input
            id={`${id}-search`}
            type="search"
            value={search}
            placeholder="Nome, código ou vínculo"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {filters.map((filter) => (
          <div key={filter.key}>
            <Label htmlFor={`${id}-${filter.key}`}>{filter.label}</Label>
            <Select
              id={`${id}-${filter.key}`}
              value={selected[filter.key] ?? ""}
              onChange={(e) => {
                setSelected({ ...selected, [filter.key]: e.target.value });
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={reset}>
          Limpar busca e filtros
        </Button>
        <details className="min-w-0">
          <summary className="cursor-pointer text-sm underline underline-offset-4">
            Colunas visíveis
          </summary>
          <div className="mt-3 flex flex-wrap gap-4">
            {columns.map((column) => (
              <label
                key={column.key}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={!hidden.includes(column.key)}
                  disabled={
                    visible.length === 1 && !hidden.includes(column.key)
                  }
                  onChange={(e) =>
                    setHidden(
                      e.target.checked
                        ? hidden.filter((key) => key !== column.key)
                        : [...hidden, column.key],
                    )
                  }
                />
                {column.label}
              </label>
            ))}
          </div>
        </details>
      </div>
      <p className="text-sm text-muted" role="status">
        {result.total} de {records.length} registros ·{" "}
        {result.total ? (result.page - 1) * pageSize + 1 : 0}–
        {Math.min(result.page * pageSize, result.total)} exibidos
      </p>
      <div className="flex flex-wrap items-end gap-3 lg:hidden">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${id}-sort`}>Ordenar por</Label>
          <Select
            id={`${id}-sort`}
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value);
              setPage(1);
            }}
          >
            {columns.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}
        >
          {direction === "asc" ? "Crescente ↑" : "Decrescente ↓"}
        </Button>
      </div>
      {!result.rows.length ? (
        <EmptyState
          title={
            records.length
              ? "Nenhum resultado encontrado"
              : "Nenhum registro demonstrativo"
          }
          description={
            records.length
              ? "Tente outra busca ou limpe os filtros para ampliar os resultados."
              : "Use a ação de novo exemplo para incluir o primeiro registro em memória."
          }
          action={
            records.length ? (
              <Button variant="outline" onClick={reset}>
                Limpar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="hidden min-w-0 rounded-lg border border-border lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">
                {label} · registros demonstrativos
              </caption>
              <thead className="bg-surface-secondary">
                <tr>
                  {visible.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        sortKey === column.key
                          ? direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="break-words p-3"
                    >
                      <button
                        type="button"
                        className="max-w-full break-words text-left"
                        onClick={() => sort(column.key)}
                      >
                        {column.label}{" "}
                        <span aria-hidden="true">
                          {sortKey === column.key
                            ? direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="w-24 p-3">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((record) => (
                  <tr
                    key={record.id}
                    className="table-row border-t border-border"
                  >
                    {visible.map((column) => (
                      <td
                        key={column.key}
                        className="break-words p-3 align-top [overflow-wrap:anywhere]"
                      >
                        {column.render?.(record) ?? String(column.get(record))}
                      </td>
                    ))}
                    <td className="p-3 align-top">{actions(record)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-4 lg:hidden">
            {result.rows.map((record) => (
              <article
                key={record.id}
                className="rounded-xl border border-border bg-background p-4"
              >
                <dl className="grid gap-4 sm:grid-cols-2">
                  {visible.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-xs text-muted">{column.label}</dt>
                      <dd className="mt-1 break-words text-sm [overflow-wrap:anywhere]">
                        {column.render?.(record) ?? String(column.get(record))}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex justify-end">{actions(record)}</div>
              </article>
            ))}
          </div>
        </>
      )}
      <nav
        aria-label={`Paginação de ${label}`}
        className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5"
      >
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-size`}>Por página</Label>
          <Select
            id={`${id}-size`}
            className="w-20"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[5, 10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </div>
        <span className="text-sm">
          Página {result.page} de {result.totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={result.page === 1}
            onClick={() => setPage(result.page - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={result.page === result.totalPages}
            onClick={() => setPage(result.page + 1)}
          >
            Próxima
          </Button>
        </div>
      </nav>
    </div>
  );
}
