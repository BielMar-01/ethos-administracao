// Deterministic summaries only; no personal data is returned by these queries.
const scope = "n.nspname IN ('ethos','ethos_technical')";
export const catalogIntegritySql = `SELECT jsonb_build_object(
  'tables', (SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity) ORDER BY n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND c.relkind='r'),
  'constraints', (SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,k.convalidated,pg_get_constraintdef(k.oid)) ORDER BY n.nspname,c.relname,k.conname)
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope}),
  'indexes', (SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_get_indexdef(c.oid)) ORDER BY n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND c.relkind='i'),
  'policies', (SELECT jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) ORDER BY schemaname,tablename,policyname)
    FROM pg_policies WHERE schemaname IN ('ethos','ethos_technical')),
  'functions', (SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,p.oid::regprocedure::text)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${scope}),
  'triggers', (SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid)) ORDER BY n.nspname,c.relname,t.tgname)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${scope} AND NOT t.tgisinternal),
  'enums', (SELECT jsonb_agg(jsonb_build_array(n.nspname,t.typname,e.enumsortorder,e.enumlabel) ORDER BY n.nspname,t.typname,e.enumsortorder)
    FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE ${scope})
) AS catalog`;

export function dataIntegritySql(tables) {
  return tables
    .map(([schema, table]) => {
      // Names are catalog-derived, but still quoted rather than interpolated as SQL code.
      const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
      const label = `${schema}.${table}`.replaceAll("'", "''");
      return `SELECT jsonb_build_object('table','${label}','rows',count(*)::text,
      'sha256',encode(sha256(convert_to(coalesce(string_agg(row_hash,'' ORDER BY row_hash),''),'UTF8')),'hex')) AS data
      FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS row_hash
      FROM ${identifier(schema)}.${identifier(table)} t) rows`;
    })
    .join(";\n");
}

export async function readIntegrity(client) {
  const catalog = (await client.query(catalogIntegritySql)).rows[0].catalog;
  const sql = dataIntegritySql(catalog.tables);
  const result = await client.query(sql);
  return { catalog, data: result.map((entry) => entry.rows[0].data) };
}
