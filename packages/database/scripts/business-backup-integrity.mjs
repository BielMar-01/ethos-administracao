import { catalogIntegritySql } from "./backup-integrity.mjs";
export const applicationCatalogSql = catalogIntegritySql.replaceAll(
  "'ethos','ethos_technical'",
  "'ethos','ethos_identity','ethos_technical'",
);
export const applicationAclSql = `SELECT jsonb_build_object(
 'schemas',(SELECT jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('ethos','ethos_identity','ethos_technical')),
 'tables',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relacl::text) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('ethos','ethos_identity','ethos_technical') AND c.relkind IN ('r','S','v')),
 'columns',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,a.attacl::text) ORDER BY n.nspname,c.relname,a.attname) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('ethos','ethos_identity','ethos_technical') AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL),
 'functions',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),p.proacl::text) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('ethos','ethos_identity','ethos_technical')),
 'defaults',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,d.defaclacl::text) ORDER BY n.nspname,d.defaclobjtype) FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IN ('ethos','ethos_identity','ethos_technical'))
) AS acl`;
