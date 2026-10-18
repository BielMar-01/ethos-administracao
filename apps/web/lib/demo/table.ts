export type SortValue = string | number;
export type SortDirection = "asc" | "desc";
export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

export function queryRows<T>(
  records: readonly T[],
  options: {
    search: string;
    searchText: (record: T) => string;
    filters?: { value: string; get: (record: T) => string }[];
    sort?: { get: (record: T) => SortValue; direction: SortDirection };
    page: number;
    pageSize: number;
  },
) {
  const query = normalize(options.search.trim());
  const filtered = records.filter(
    (r) =>
      (!query || normalize(options.searchText(r)).includes(query)) &&
      (options.filters ?? []).every(
        (filter) => !filter.value || filter.get(r) === filter.value,
      ),
  );
  if (options.sort) {
    const { get, direction } = options.sort;
    filtered.sort((a, b) => {
      const first = get(a),
        second = get(b);
      const result =
        typeof first === "number" && typeof second === "number"
          ? first - second
          : String(first).localeCompare(String(second), "pt-BR", {
              numeric: true,
              sensitivity: "base",
            });
      return direction === "asc" ? result : -result;
    });
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / options.pageSize));
  const page = Math.max(1, Math.min(options.page, totalPages));
  return {
    rows: filtered.slice(
      (page - 1) * options.pageSize,
      page * options.pageSize,
    ),
    total: filtered.length,
    totalPages,
    page,
  };
}
