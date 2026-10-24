// Only canonicalize two verified PostgreSQL deparser/default-ACL representations.
export function canonicalConstraints(rows) {
  return rows.map((row) =>
    row.map((value, i) =>
      i === 4
        ? value.replace(
            /ANY \(\(ARRAY\[((?:'[^']*'::character varying(?:, )?)+)\]\)::text\[\]\)/g,
            (_, items) =>
              `ANY (ARRAY[${items
                .split(", ")
                .map((item) => `(${item})::text`)
                .join(", ")}])`,
          )
        : value,
    ),
  );
}
export function canonicalTableAcl(rows) {
  return rows.map(([schema, table, owner, acl]) => [
    schema,
    table,
    owner,
    acl === `{${owner}=arwdDxtm/${owner}}` ? null : acl,
  ]);
}
