import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { parseTaxonomyRows, taxonomyLookupQuery, type TaxonomyLookupInput } from './taxonomy-lookup.query';

export const TAXONOMY_OPERATIONAL_REVISIONS = {
  ISIC: 'ISIC_REV_4',
  NACE: 'NACE_REV_2',
} as const;

export const TAXONOMY_MANAGEMENT_SYSTEMS = ['QMS', 'EMS', 'OHSMS'] as const;
export const TAXONOMY_MAPPING_TYPES = ['EXACT', 'PARTIAL', 'ONE_TO_MANY'] as const;

type ManagementSystem = (typeof TAXONOMY_MANAGEMENT_SYSTEMS)[number];

type ClassificationRow = {
  id: string;
  classification_type: string;
  revision: string;
  code: string;
  title_en: string;
  title_vi: string | null;
  parent_code: string | null;
  level: number;
  valid_from: Date | null;
  valid_to: Date | null;
  is_active: boolean;
};

type IndustryMappingRow = {
  id: string;
  source_code_id: string;
  target_code_id: string;
  mapping_type: string;
  valid_from: Date | null;
  valid_to: Date | null;
  source_code: ClassificationRow;
  target_code: ClassificationRow;
};

type NaceIafMappingRow = {
  id: string;
  nace_code_id: string;
  iaf_scope_id: string;
  management_system: string;
  source_document: string | null;
  valid_from: Date | null;
  valid_to: Date | null;
  nace_code: ClassificationRow;
  iaf_scope: {
    id: string;
    iaf_code: string;
    iaf_name: string;
    is_active: boolean;
  };
};

type TaxonomySnapshot = {
  at: Date;
  classifications: ClassificationRow[];
  industryMappings: IndustryMappingRow[];
  naceIafMappings: NaceIafMappingRow[];
  iafScopes: Array<{
    id: string;
    iaf_code: string;
    iaf_name: string;
    is_active: boolean;
  }>;
};

export type TaxonomyIndustryScopeInput = {
  isic_code_id: string;
  isic_nace_mapping_id: string;
  nace_code_id: string;
  nace_iaf_mapping_id: string;
  management_system: ManagementSystem;
  scope_description: string;
  is_primary?: boolean;
};

@Injectable()
export class TaxonomyRuntimePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  private businessDate(value = new Date()) {
    const result = new Date(value);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }

  private isEffective(validFrom: Date | null, validTo: Date | null, at: Date) {
    return (!validFrom || validFrom <= at) && (!validTo || validTo >= at);
  }

  private normalizeManagementSystem(value: string): ManagementSystem {
    const normalized = value.trim().toUpperCase();
    if (!TAXONOMY_MANAGEMENT_SYSTEMS.includes(normalized as ManagementSystem)) {
      throw new BadRequestException(
        'Hệ thống quản lý phải là QMS, EMS hoặc OHSMS',
      );
    }
    return normalized as ManagementSystem;
  }

  isOperationalClassification(row: ClassificationRow, at: Date) {
    const expectedRevision =
      TAXONOMY_OPERATIONAL_REVISIONS[
        row.classification_type as keyof typeof TAXONOMY_OPERATIONAL_REVISIONS
      ];
    return (
      Boolean(expectedRevision) &&
      row.revision === expectedRevision &&
      row.is_active &&
      this.isEffective(row.valid_from, row.valid_to, at)
    );
  }

  assertPublishableMapping(mapping: IndustryMappingRow | NaceIafMappingRow, at = new Date()) {
    const today = this.businessDate(at);
    if (!this.isEffective(mapping.valid_from, mapping.valid_to, today)) {
      throw new BadRequestException('Mapping chưa hoặc không còn hiệu lực');
    }
    if ('source_code' in mapping) {
      if (mapping.source_code.classification_type !== 'ISIC' ||
          mapping.target_code.classification_type !== 'NACE' ||
          !this.isOperationalClassification(mapping.source_code, today) ||
          !this.isOperationalClassification(mapping.target_code, today) ||
          !(TAXONOMY_MAPPING_TYPES as readonly string[]).includes(mapping.mapping_type)) {
        throw new BadRequestException('Tham chiếu hoặc kiểu ánh xạ ISIC–NACE không hợp lệ cho vận hành');
      }
    } else if (mapping.nace_code.classification_type !== 'NACE' ||
        !this.isOperationalClassification(mapping.nace_code, today) ||
        !mapping.iaf_scope.is_active ||
        !(TAXONOMY_MANAGEMENT_SYSTEMS as readonly string[]).includes(mapping.management_system)) {
      throw new BadRequestException('Tham chiếu hoặc hệ thống NACE–IAF không hợp lệ cho vận hành');
    }
  }

  private async loadSnapshot(at = new Date()): Promise<TaxonomySnapshot> {
    const [classifications, industryMappings, naceIafMappings, iafScopes] =
      await Promise.all([
        this.prisma.industry_classifications.findMany({
          where: {
            classification_type: { in: ['ISIC', 'NACE'] },
          },
        }),
        this.prisma.industry_code_mappings.findMany({
          where: { mapping_status: 'APPROVED' },
          include: {
            source_code: true,
            target_code: true,
          },
        }),
        this.prisma.nace_iaf_mappings.findMany({
          where: { mapping_status: 'APPROVED' },
          include: {
            nace_code: true,
            iaf_scope: true,
          },
        }),
        this.prisma.iaf_scopes.findMany(),
      ]);

    return {
      at: this.businessDate(at),
      classifications,
      industryMappings,
      naceIafMappings,
      iafScopes,
    };
  }

  private descendants(source: ClassificationRow, snapshot: TaxonomySnapshot) {
    if (source.level === 4) return [source];

    const rows = snapshot.classifications.filter(
      (row) =>
        row.classification_type === source.classification_type &&
        row.revision === source.revision &&
        this.isOperationalClassification(row, snapshot.at),
    );
    const children = new Map<string, ClassificationRow[]>();
    for (const row of rows) {
      if (!row.parent_code) continue;
      const bucket = children.get(row.parent_code) ?? [];
      bucket.push(row);
      children.set(row.parent_code, bucket);
    }

    const result: ClassificationRow[] = [];
    const pending = [source.code];
    const visited = new Set<string>();
    while (pending.length) {
      const code = pending.shift()!;
      if (visited.has(code)) continue;
      visited.add(code);
      for (const child of children.get(code) ?? []) {
        if (child.level === 4) result.push(child);
        else pending.push(child.code);
      }
    }
    return result;
  }

  private isOutsideIafTable(code: string) {
    return /^(?:97|98|99)(?:\.|$)/.test(code.trim());
  }

  private resolveNace(
    nace: ClassificationRow,
    managementSystem: ManagementSystem,
    snapshot: TaxonomySnapshot,
  ) {
    const validMapping = (mapping: NaceIafMappingRow) =>
      mapping.management_system === managementSystem &&
      mapping.iaf_scope.is_active &&
      this.isOperationalClassification(mapping.nace_code, snapshot.at) &&
      this.isEffective(mapping.valid_from, mapping.valid_to, snapshot.at);

    const direct = snapshot.naceIafMappings
      .filter(
        (mapping) => mapping.nace_code_id === nace.id && validMapping(mapping),
      )
      .map((mapping) => ({
        mapping_id: mapping.id,
        iaf_scope_id: mapping.iaf_scope_id,
        iaf_code: mapping.iaf_scope.iaf_code,
        iaf_name: mapping.iaf_scope.iaf_name,
        source_document: mapping.source_document,
        derived: false,
        derived_from_nace_codes: [] as string[],
      }));

    if (direct.length) {
      return {
        iaf_candidates: direct,
        resolution_status:
          direct.length === 1 ? 'DIRECT_UNIQUE' : 'DIRECT_MULTIPLE',
        derived_from_nace_classes: [] as string[],
        outside_iaf_table: false,
      };
    }

    const descendants = this.descendants(nace, snapshot);
    if (!descendants.length) {
      const outside = this.isOutsideIafTable(nace.code);
      return {
        iaf_candidates: [],
        resolution_status: outside ? 'OUTSIDE_IAF_TABLE' : 'UNRESOLVED',
        derived_from_nace_classes: [] as string[],
        outside_iaf_table: outside,
      };
    }

    const descendantIds = new Set(descendants.map((row) => row.id));
    const candidates = new Map<
      string,
      {
        mapping_id: string;
        iaf_scope_id: string;
        iaf_code: string;
        iaf_name: string;
        source_document: string | null;
        derived: boolean;
        derived_from_nace_codes: string[];
      }
    >();
    for (const mapping of snapshot.naceIafMappings) {
      if (!descendantIds.has(mapping.nace_code_id) || !validMapping(mapping)) {
        continue;
      }
      const code = mapping.iaf_scope.iaf_code;
      const existing = candidates.get(code);
      if (existing) {
        if (
          !existing.derived_from_nace_codes.includes(mapping.nace_code.code)
        ) {
          existing.derived_from_nace_codes.push(mapping.nace_code.code);
        }
        continue;
      }
      candidates.set(code, {
        mapping_id: `DERIVED:${nace.id}:${managementSystem}:${code}`,
        iaf_scope_id: mapping.iaf_scope_id,
        iaf_code: code,
        iaf_name: mapping.iaf_scope.iaf_name,
        source_document: mapping.source_document,
        derived: true,
        derived_from_nace_codes: [mapping.nace_code.code],
      });
    }

    const iafCandidates = [...candidates.values()]
      .map((candidate) => ({
        ...candidate,
        derived_from_nace_codes: candidate.derived_from_nace_codes.sort(),
      }))
      .sort((a, b) => Number(a.iaf_code) - Number(b.iaf_code));
    const descendantCodes = descendants.map((row) => row.code).sort();
    const outside =
      iafCandidates.length === 0 &&
      descendantCodes.every((code) => this.isOutsideIafTable(code));

    return {
      iaf_candidates: iafCandidates,
      resolution_status: outside
        ? 'OUTSIDE_IAF_TABLE'
        : iafCandidates.length === 1
          ? 'DERIVED_UNIQUE'
          : iafCandidates.length > 1
            ? 'DERIVED_MULTIPLE'
            : 'UNRESOLVED',
      derived_from_nace_classes: descendantCodes,
      outside_iaf_table: outside,
    };
  }

  private buildIafSummary(
    naceCandidates: Array<{
      iaf_candidates: Array<{
        iaf_code: string;
        iaf_name: string;
        source_document?: string | null;
      }>;
      outside_iaf_table?: boolean;
    }>,
  ) {
    const candidates = new Map<
      string,
      {
        iaf_code: string;
        iaf_name: string;
        source_document?: string | null;
      }
    >();
    for (const candidate of naceCandidates) {
      for (const iaf of candidate.iaf_candidates) {
        if (!candidates.has(iaf.iaf_code)) {
          candidates.set(iaf.iaf_code, {
            iaf_code: iaf.iaf_code,
            iaf_name: iaf.iaf_name,
            source_document: iaf.source_document,
          });
        }
      }
    }
    const values = [...candidates.values()].sort(
      (a, b) => Number(a.iaf_code) - Number(b.iaf_code),
    );
    const allOutside =
      naceCandidates.length > 0 &&
      naceCandidates.every((candidate) => candidate.outside_iaf_table);
    return {
      status: allOutside
        ? 'OUTSIDE_IAF_TABLE'
        : values.length === 1
          ? 'UNIQUE'
          : values.length > 1
            ? 'MULTIPLE'
            : 'UNRESOLVED',
      candidates: values,
      iaf_codes: values.map((value) => value.iaf_code),
    };
  }

  private resolveFromSnapshot(
    classificationType: string,
    revision: string,
    code: string,
    managementSystem: string,
    snapshot: TaxonomySnapshot,
  ) {
    const safeType = classificationType.trim().toUpperCase();
    if (safeType !== 'ISIC' && safeType !== 'NACE') {
      throw new BadRequestException('Chỉ hỗ trợ tra cứu từ ISIC hoặc NACE');
    }
    const expectedRevision = TAXONOMY_OPERATIONAL_REVISIONS[safeType];
    if (revision.trim().toUpperCase() !== expectedRevision) {
      throw new BadRequestException(
        `Phiên bản vận hành cho ${safeType} phải là ${expectedRevision}`,
      );
    }
    const safeManagementSystem =
      this.normalizeManagementSystem(managementSystem);
    const source = snapshot.classifications.find(
      (row) =>
        row.classification_type === safeType &&
        row.revision === expectedRevision &&
        row.code === code.trim(),
    );
    if (!source) throw new NotFoundException('Không tìm thấy mã ngành');
    if (!this.isOperationalClassification(source, snapshot.at)) {
      throw new BadRequestException('Mã ngành không đang hiệu lực');
    }

    if (safeType === 'NACE') {
      const resolved = this.resolveNace(source, safeManagementSystem, snapshot);
      const naceCandidates = [
        {
          nace: source,
          mapping_type: resolved.resolution_status.startsWith('DERIVED_')
            ? 'DERIVED_FROM_CHILDREN'
            : 'DIRECT',
          ...resolved,
        },
      ];
      return {
        source,
        management_system: safeManagementSystem,
        nace_candidates: naceCandidates,
        iaf_summary: this.buildIafSummary(naceCandidates),
        requires_selection: resolved.iaf_candidates.length > 1,
        review_required: true,
      };
    }

    const sourceRows = this.descendants(source, snapshot);
    const sourceIds = new Set(sourceRows.map((row) => row.id));
    const mappings = snapshot.industryMappings.filter(
      (mapping) =>
        sourceIds.has(mapping.source_code_id) &&
        (TAXONOMY_MAPPING_TYPES as readonly string[]).includes(mapping.mapping_type) &&
        this.isOperationalClassification(mapping.source_code, snapshot.at) &&
        this.isOperationalClassification(mapping.target_code, snapshot.at) &&
        this.isEffective(mapping.valid_from, mapping.valid_to, snapshot.at),
    );
    const targets = new Map<
      string,
      IndustryMappingRow & {
        derived_from_isic_codes: string[];
      }
    >();
    for (const mapping of mappings) {
      const existing = targets.get(mapping.target_code_id);
      if (existing) {
        if (
          !existing.derived_from_isic_codes.includes(mapping.source_code.code)
        ) {
          existing.derived_from_isic_codes.push(mapping.source_code.code);
        }
      } else {
        targets.set(mapping.target_code_id, {
          ...mapping,
          derived_from_isic_codes: [mapping.source_code.code],
        });
      }
    }
    const naceCandidates = [...targets.values()].map((mapping) => ({
      mapping_id: mapping.id,
      mapping_type:
        source.level === 4 ? mapping.mapping_type : 'DERIVED_FROM_CHILDREN',
      nace: mapping.target_code,
      derived_from_isic_codes: mapping.derived_from_isic_codes.sort(),
      ...this.resolveNace(mapping.target_code, safeManagementSystem, snapshot),
    }));
    const iafSummary = this.buildIafSummary(naceCandidates);
    return {
      source,
      management_system: safeManagementSystem,
      nace_candidates: naceCandidates,
      iaf_summary: iafSummary,
      requires_selection:
        naceCandidates.length !== 1 ||
        !['EXACT', 'DIRECT'].includes(naceCandidates[0]?.mapping_type),
      iaf_auto_resolved: iafSummary.status === 'UNIQUE',
      review_required: true,
    };
  }

  async resolve(
    classificationType: string,
    revision: string,
    code: string,
    managementSystem: string,
    at = new Date(),
  ) {
    const [result] = await this.resolveBatch([{
      classification_type: classificationType, revision, code,
      management_system: managementSystem,
    }], at);
    return result;
  }


  async resolveBatch(
    items: Array<{
      classification_type: string;
      revision: string;
      code: string;
      management_system: string;
    }>,
    at = new Date(),
  ) {
    if (!items.length) return [];

    const requested: TaxonomyLookupInput[] = items.map((item) => {
      const type = item.classification_type.trim().toUpperCase();
      if (type !== 'ISIC' && type !== 'NACE') {
        throw new BadRequestException('Chỉ hỗ trợ tra cứu từ ISIC hoặc NACE');
      }
      const revision = item.revision.trim().toUpperCase();
      if (revision !== TAXONOMY_OPERATIONAL_REVISIONS[type]) {
        throw new BadRequestException(`Phiên bản vận hành cho ${type} phải là ${TAXONOMY_OPERATIONAL_REVISIONS[type]}`);
      }
      return { classification_type: type, revision, code: item.code.trim(),
        management_system: this.normalizeManagementSystem(item.management_system) };
    });
    const rows = await this.prisma.$queryRaw<Array<{
      classifications: string; industryMappings: string; naceIafMappings: string;
    }>>(taxonomyLookupQuery(requested, this.businessDate(at)));
    const row = rows[0];
    if (!row) throw new NotFoundException('Không tìm thấy mã ngành');
    const snapshot: TaxonomySnapshot = {
      at: this.businessDate(at),
      classifications: parseTaxonomyRows<ClassificationRow>(row.classifications),
      industryMappings: parseTaxonomyRows<IndustryMappingRow>(row.industryMappings),
      naceIafMappings: parseTaxonomyRows<NaceIafMappingRow>(row.naceIafMappings),
      iafScopes: [],
    };
    return items.map((item) =>
      this.resolveFromSnapshot(
        item.classification_type,
        item.revision,
        item.code,
        item.management_system,
        snapshot,
      ),
    );
  }

  private coverageFromSnapshot(
    managementSystem: ManagementSystem,
    snapshot: TaxonomySnapshot,
  ) {
    const isicClasses = snapshot.classifications.filter(
      (row) =>
        row.classification_type === 'ISIC' &&
        row.level === 4 &&
        this.isOperationalClassification(row, snapshot.at),
    );
    let unique = 0;
    let multiple = 0;
    let outside = 0;
    const unresolvedItems: Array<{
      code: string;
      title: string;
      reason_code: string;
      missing_nace_codes: string[];
    }> = [];
    for (const isic of isicClasses) {
      const result = this.resolveFromSnapshot(
        'ISIC',
        TAXONOMY_OPERATIONAL_REVISIONS.ISIC,
        isic.code,
        managementSystem,
        snapshot,
      );
      if (!result.nace_candidates.length) {
        unresolvedItems.push({
          code: isic.code,
          title: isic.title_vi ?? isic.title_en,
          reason_code: 'ISIC_NACE_MAPPING_MISSING',
          missing_nace_codes: [],
        });
        continue;
      }
      const missingNace = result.nace_candidates
        .filter((candidate) => candidate.resolution_status === 'UNRESOLVED')
        .map((candidate) => candidate.nace.code);
      if (missingNace.length) {
        unresolvedItems.push({
          code: isic.code,
          title: isic.title_vi ?? isic.title_en,
          reason_code: 'NACE_IAF_MAPPING_MISSING',
          missing_nace_codes: [...new Set(missingNace)].sort(),
        });
        continue;
      }
      if (result.iaf_summary.status === 'OUTSIDE_IAF_TABLE') outside += 1;
      else if (result.iaf_summary.status === 'UNIQUE') unique += 1;
      else if (result.iaf_summary.status === 'MULTIPLE') multiple += 1;
      else {
        unresolvedItems.push({
          code: isic.code,
          title: isic.title_vi ?? isic.title_en,
          reason_code: 'NACE_IAF_MAPPING_MISSING',
          missing_nace_codes: [],
        });
      }
    }
    return {
      management_system: managementSystem,
      total_isic_classes: isicClasses.length,
      resolved: unique + multiple,
      unique_iaf: unique,
      multiple_iaf: multiple,
      outside_iaf_table: outside,
      unresolved: unresolvedItems.length,
      unresolved_items: unresolvedItems.slice(0, 50),
      complete_for_certifiable_isic: unresolvedItems.length === 0,
      note: 'Các ISIC quy đổi duy nhất tới NACE 97/98/99 được ghi nhận là ngoài bảng IAF, không được gán IAF giả.',
    };
  }

  async getMappingCoverage(managementSystem: string, at = new Date()) {
    const safeManagementSystem =
      this.normalizeManagementSystem(managementSystem);
    return this.coverageFromSnapshot(
      safeManagementSystem,
      await this.loadSnapshot(at),
    );
  }

  async getNaceIafProjection(managementSystem: string, at = new Date()) {
    const safeManagementSystem =
      this.normalizeManagementSystem(managementSystem);
    const snapshot = await this.loadSnapshot(at);
    const items = snapshot.classifications
      .filter(
        (row) =>
          row.classification_type === 'NACE' &&
          this.isOperationalClassification(row, snapshot.at),
      )
      .map((nace) => ({
        nace,
        ...this.resolveNace(nace, safeManagementSystem, snapshot),
      }))
      .sort((a, b) => a.nace.code.localeCompare(b.nace.code));
    return {
      management_system: safeManagementSystem,
      operational_revision: TAXONOMY_OPERATIONAL_REVISIONS.NACE,
      generated_at: snapshot.at.toISOString(),
      items,
    };
  }

  async getReadiness(at = new Date()) {
    const snapshot = await this.loadSnapshot(at);
    const operational = snapshot.classifications.filter((row) =>
      this.isOperationalClassification(row, snapshot.at),
    );
    const isicCount = operational.filter(
      (row) => row.classification_type === 'ISIC',
    ).length;
    const naceCount = operational.filter(
      (row) => row.classification_type === 'NACE',
    ).length;
    const activeIaf = snapshot.iafScopes.filter((scope) => scope.is_active);
    const coverage = TAXONOMY_MANAGEMENT_SYSTEMS.map((system) =>
      this.coverageFromSnapshot(system, snapshot),
    );
    const reasons: Array<{
      code: string;
      blocking: boolean;
      management_system?: ManagementSystem;
      message: string;
    }> = [];
    if (!isicCount)
      reasons.push({
        code: 'TAXONOMY_ISIC_DATA_MISSING',
        blocking: true,
        message: `Không có mã ${TAXONOMY_OPERATIONAL_REVISIONS.ISIC} đang hiệu lực.`,
      });
    if (!naceCount)
      reasons.push({
        code: 'TAXONOMY_NACE_DATA_MISSING',
        blocking: true,
        message: `Không có mã ${TAXONOMY_OPERATIONAL_REVISIONS.NACE} đang hiệu lực.`,
      });
    if (!activeIaf.length)
      reasons.push({
        code: 'TAXONOMY_IAF_DATA_MISSING',
        blocking: true,
        message: 'Không có phạm vi IAF đang hoạt động.',
      });
    for (const item of coverage) {
      if (!item.complete_for_certifiable_isic)
        reasons.push({
          code: 'TAXONOMY_COVERAGE_INCOMPLETE',
          blocking: true,
          management_system: item.management_system,
          message: `${item.management_system} còn ${item.unresolved} mã ISIC chưa phân giải.`,
        });
    }
    return {
      ready: reasons.every((reason) => !reason.blocking),
      operational_revisions: { ...TAXONOMY_OPERATIONAL_REVISIONS },
      isic_count: isicCount,
      nace_count: naceCount,
      iaf_count: activeIaf.length,
      coverage,
      reasons,
    };
  }

  async validateIndustryScopes(
    scopes: TaxonomyIndustryScopeInput[],
    at = new Date(),
  ) {
    const snapshot = await this.loadSnapshot(at);
    const uniqueKeys = new Set<string>();
    return scopes.map((scope, index) => {
      const managementSystem = this.normalizeManagementSystem(
        scope.management_system,
      );
      const uniqueKey = [
        scope.isic_nace_mapping_id,
        scope.nace_iaf_mapping_id,
        managementSystem,
      ].join(':');
      if (uniqueKeys.has(uniqueKey)) {
        throw new BadRequestException(
          `Phạm vi mã ngành số ${index + 1} bị trùng`,
        );
      }
      uniqueKeys.add(uniqueKey);

      const isic = snapshot.classifications.find(
        (row) => row.id === scope.isic_code_id,
      );
      if (
        !isic ||
        isic.classification_type !== 'ISIC' ||
        !this.isOperationalClassification(isic, snapshot.at)
      ) {
        throw new BadRequestException(
          `Mã ISIC số ${index + 1} không thuộc phiên bản vận hành hoặc không đang hiệu lực`,
        );
      }
      const resolved = this.resolveFromSnapshot(
        'ISIC',
        TAXONOMY_OPERATIONAL_REVISIONS.ISIC,
        isic.code,
        managementSystem,
        snapshot,
      );
      const naceCandidate = resolved.nace_candidates.find(
        (candidate) =>
          'mapping_id' in candidate &&
          candidate.mapping_id === scope.isic_nace_mapping_id &&
          candidate.nace.id === scope.nace_code_id,
      );
      const iafCandidate = naceCandidate?.iaf_candidates.find(
        (candidate) =>
          candidate.mapping_id === scope.nace_iaf_mapping_id &&
          !candidate.derived,
      );
      if (!naceCandidate || !iafCandidate) {
        throw new BadRequestException(
          `Ánh xạ mã ngành số ${index + 1} không còn là kết quả hợp lệ của policy vận hành`,
        );
      }
      return {
        isic_code_id: isic.id,
        isic_code: isic.code,
        isic_revision: isic.revision,
        isic_title: isic.title_vi ?? isic.title_en,
        isic_nace_mapping_id: scope.isic_nace_mapping_id,
        nace_code_id: naceCandidate.nace.id,
        nace_code: naceCandidate.nace.code,
        nace_title: naceCandidate.nace.title_vi ?? naceCandidate.nace.title_en,
        nace_iaf_mapping_id: iafCandidate.mapping_id,
        iaf_code: iafCandidate.iaf_code,
        iaf_name: iafCandidate.iaf_name,
        management_system: managementSystem,
        scope_description: scope.scope_description.trim(),
        is_primary: scope.is_primary ?? index === 0,
      };
    });
  }
}
