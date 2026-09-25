import { Prisma } from '@prisma/client';

export type TaxonomyLookupInput = {
  classification_type: string;
  revision: string;
  code: string;
  management_system: string;
};

// One parameterized statement restricted to the requested taxonomy branches.
export function taxonomyLookupQuery(items: TaxonomyLookupInput[], at: Date) {
  return Prisma.sql`
WITH requested AS (
  SELECT DISTINCT classification_type, revision, code, management_system
  FROM OPENJSON(${JSON.stringify(items)}) WITH (
    classification_type nvarchar(20), revision nvarchar(30),
    code nvarchar(30), management_system nvarchar(30)
  )
), roots AS (
  SELECT DISTINCT c.* FROM industry_classifications c
  JOIN requested r ON r.classification_type = c.classification_type
    AND r.revision = c.revision AND r.code = c.code
), source_walk AS (
  SELECT id, classification_type, revision, code, parent_code, level FROM roots
  UNION ALL
  SELECT c.id, c.classification_type, c.revision, c.code, c.parent_code, c.level
  FROM industry_classifications c JOIN source_walk p
    ON c.parent_code = p.code AND c.revision = p.revision
    AND c.classification_type = p.classification_type
  WHERE p.level <> 4 AND c.is_active = 1
    AND (c.valid_from IS NULL OR c.valid_from <= ${at})
    AND (c.valid_to IS NULL OR c.valid_to >= ${at})
), industry AS (
  SELECT m.* FROM industry_code_mappings m
  WHERE m.mapping_status = 'APPROVED' AND m.source_code_id IN (
    SELECT id FROM source_walk WHERE classification_type = 'ISIC' AND level = 4
  )
), nace_roots AS (
  SELECT c.* FROM industry_classifications c WHERE c.id IN (
    SELECT target_code_id FROM industry
    UNION SELECT id FROM roots WHERE classification_type = 'NACE'
  )
), nace_walk AS (
  SELECT id, classification_type, revision, code, parent_code, level FROM nace_roots
  UNION ALL
  SELECT c.id, c.classification_type, c.revision, c.code, c.parent_code, c.level
  FROM industry_classifications c JOIN nace_walk p
    ON c.parent_code = p.code AND c.revision = p.revision
    AND c.classification_type = p.classification_type
  WHERE p.level <> 4 AND c.is_active = 1
    AND (c.valid_from IS NULL OR c.valid_from <= ${at})
    AND (c.valid_to IS NULL OR c.valid_to >= ${at})
), nace_maps AS (
  SELECT m.* FROM nace_iaf_mappings m
  WHERE m.mapping_status = 'APPROVED'
    AND m.nace_code_id IN (SELECT id FROM nace_walk)
    AND m.management_system IN (SELECT management_system FROM requested)
)
SELECT
  (SELECT c.* FROM industry_classifications c WHERE c.id IN (
    SELECT id FROM source_walk UNION SELECT id FROM nace_walk
  ) FOR JSON PATH, INCLUDE_NULL_VALUES) AS classifications,
  (SELECT m.*,
    JSON_QUERY((SELECT c.* FROM industry_classifications c WHERE c.id = m.source_code_id FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER)) AS source_code,
    JSON_QUERY((SELECT c.* FROM industry_classifications c WHERE c.id = m.target_code_id FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER)) AS target_code
   FROM industry m ORDER BY m.id FOR JSON PATH, INCLUDE_NULL_VALUES) AS industryMappings,
  (SELECT m.*,
    JSON_QUERY((SELECT c.* FROM industry_classifications c WHERE c.id = m.nace_code_id FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER)) AS nace_code,
    JSON_QUERY((SELECT s.* FROM iaf_scopes s WHERE s.id = m.iaf_scope_id FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER)) AS iaf_scope
   FROM nace_maps m ORDER BY m.id FOR JSON PATH, INCLUDE_NULL_VALUES) AS naceIafMappings
OPTION (MAXRECURSION 100);`;
}

export function parseTaxonomyRows<T>(json: string | null): T[] {
  return (JSON.parse(json ?? '[]', (key, value) =>
    value && ['valid_from', 'valid_to', 'created_at', 'updated_at', 'approved_at'].includes(key)
      ? new Date(/T/.test(value) && !/(Z|[+-]\d\d:\d\d)$/.test(value) ? `${value}Z` : value)
      : typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        ? value.toLowerCase() : value,
  ) ?? []) as T[];
}
