import { BadRequestException, Injectable } from '@nestjs/common';
import { SuggestMandayDto, MandaySiteInputDto } from './dto/suggest-manday.dto';

interface PersonnelBand {
  maximum: number;
  qms: number;
  ems: Record<'high' | 'medium' | 'low' | 'limited', number>;
  ohsms: Record<'high' | 'medium' | 'low', number>;
}

export interface StandardRuleResult {
  standard: string;
  family: 'QMS' | 'EMS' | 'OHSMS';
  complexity?: string;
  mandays: number;
}

@Injectable()
export class MandayRulesService {
  private readonly bands: PersonnelBand[] = [
    { maximum: 5, qms: 1.5, ems: { high: 3, medium: 2.5, low: 2.5, limited: 2.5 }, ohsms: { high: 3, medium: 2.5, low: 2.5 } },
    { maximum: 10, qms: 2, ems: { high: 3.5, medium: 3, low: 3, limited: 3 }, ohsms: { high: 3.5, medium: 3, low: 3 } },
    { maximum: 15, qms: 2.5, ems: { high: 4.5, medium: 3.5, low: 3, limited: 3 }, ohsms: { high: 4.5, medium: 3.5, low: 3 } },
    { maximum: 25, qms: 3, ems: { high: 5.5, medium: 4.5, low: 3.5, limited: 3 }, ohsms: { high: 5.5, medium: 4.5, low: 3.5 } },
    { maximum: 45, qms: 4, ems: { high: 7, medium: 5.5, low: 4, limited: 3 }, ohsms: { high: 7, medium: 5.5, low: 4 } },
    { maximum: 65, qms: 5, ems: { high: 8, medium: 6, low: 4.5, limited: 3.5 }, ohsms: { high: 8, medium: 6, low: 4.5 } },
    { maximum: 85, qms: 6, ems: { high: 9, medium: 7, low: 5, limited: 3.5 }, ohsms: { high: 9, medium: 7, low: 5 } },
    { maximum: 125, qms: 7, ems: { high: 11, medium: 8, low: 5.5, limited: 4 }, ohsms: { high: 11, medium: 8, low: 5.5 } },
    { maximum: 175, qms: 8, ems: { high: 12, medium: 9, low: 6, limited: 4.5 }, ohsms: { high: 12, medium: 9, low: 6 } },
    { maximum: 275, qms: 9, ems: { high: 13, medium: 10, low: 7, limited: 5 }, ohsms: { high: 13, medium: 10, low: 7 } },
    { maximum: 425, qms: 10, ems: { high: 15, medium: 11, low: 8, limited: 5.5 }, ohsms: { high: 15, medium: 11, low: 8 } },
    { maximum: 625, qms: 11, ems: { high: 16, medium: 12, low: 9, limited: 6 }, ohsms: { high: 16, medium: 12, low: 9 } },
    { maximum: 875, qms: 12, ems: { high: 17, medium: 13, low: 10, limited: 6.5 }, ohsms: { high: 17, medium: 13, low: 10 } },
    { maximum: 1175, qms: 13, ems: { high: 19, medium: 15, low: 11, limited: 7 }, ohsms: { high: 19, medium: 15, low: 11 } },
    { maximum: 1550, qms: 14, ems: { high: 20, medium: 16, low: 12, limited: 7.5 }, ohsms: { high: 20, medium: 16, low: 12 } },
    { maximum: 2025, qms: 15, ems: { high: 21, medium: 17, low: 12, limited: 8 }, ohsms: { high: 21, medium: 17, low: 12 } },
    { maximum: 2675, qms: 16, ems: { high: 23, medium: 18, low: 13, limited: 8.5 }, ohsms: { high: 23, medium: 18, low: 13 } },
    { maximum: 3450, qms: 17, ems: { high: 25, medium: 19, low: 14, limited: 9 }, ohsms: { high: 25, medium: 19, low: 14 } },
    { maximum: 4350, qms: 18, ems: { high: 27, medium: 20, low: 15, limited: 10 }, ohsms: { high: 27, medium: 20, low: 15 } },
    { maximum: 5450, qms: 19, ems: { high: 28, medium: 21, low: 16, limited: 11 }, ohsms: { high: 28, medium: 21, low: 16 } },
    { maximum: 6800, qms: 20, ems: { high: 30, medium: 23, low: 17, limited: 12 }, ohsms: { high: 30, medium: 23, low: 17 } },
    { maximum: 8500, qms: 21, ems: { high: 32, medium: 25, low: 19, limited: 13 }, ohsms: { high: 32, medium: 25, low: 19 } },
    { maximum: 10700, qms: 22, ems: { high: 34, medium: 27, low: 20, limited: 14 }, ohsms: { high: 34, medium: 27, low: 20 } },
  ];

  getReferenceTables() {
    let minimum = 1;
    const rows = this.bands.map((band) => {
      const row = {
        minimum,
        maximum: band.maximum,
        personnel_label: `${minimum}-${band.maximum}`,
        qms: band.qms,
        ems: band.ems,
        ohsms: band.ohsms,
      };
      minimum = band.maximum + 1;
      return row;
    });

    return {
      qms: rows.map((row) => ({
        minimum: row.minimum,
        maximum: row.maximum,
        personnel_label: row.personnel_label,
        mandays: row.qms,
      })),
      ems: rows.map((row) => ({
        minimum: row.minimum,
        maximum: row.maximum,
        personnel_label: row.personnel_label,
        ...row.ems,
      })),
      ohsms: rows.map((row) => ({
        minimum: row.minimum,
        maximum: row.maximum,
        personnel_label: row.personnel_label,
        ...row.ohsms,
      })),
      ims: {
        integration_levels: [20, 40, 60, 80, 100],
        capability_levels: [20, 40, 60, 80, 100],
        matrix: {
          20: [0, 0, 0, 0, 0],
          40: [0, 5, 5, 5, 5],
          60: [0, 5, 10, 10, 10],
          80: [0, 5, 10, 15, 15],
          100: [0, 5, 10, 15, 20],
        },
      },
      multi_site: {
        initial: 'y = √x',
        surveillance: 'y = 0,6√x',
        recertification: 'y = √x; có thể y = 0,8√x khi hệ thống chứng minh hiệu lực trong chu kỳ',
        non_sampling_surveillance: '30% số địa điểm mỗi năm, làm tròn lên',
      },
      rules: {
        base_rounding: 'Làm tròn về bội số 0,5 gần nhất sau khi tính tổng ngày công lần đầu trước mọi điều chỉnh.',
        stage_split: 'Stage 2 đề xuất 80%; Stage 1 là phần còn lại.',
        surveillance_ratio: 'Giám sát hằng năm = 1/3 ngày công chứng nhận lần đầu sau điều chỉnh.',
        recertification_ratio: 'Tái chứng nhận = 2/3 ngày công chứng nhận lần đầu sau điều chỉnh.',
        cycle_audit_rounding: 'Giám sát và tái chứng nhận dự kiến làm tròn về bội số 0,5 gần nhất và không thấp hơn 1 MD.',
        reduction_limit_percent: 30,
        increase_recommended_limit_percent: 30,
        increase_hard_limit_percent: null,
        ims_reduction_limit_percent: 20,
      },
      sources: ['IAF MD5', 'IAF MD11', 'IAF MD1'],
    };
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private roundToHalf(value: number): number {
    return Math.max(0.5, Math.round((value + Number.EPSILON) * 2) / 2);
  }

  private cycleAuditMandays(initialMandays: number, ratio: number): number {
    // Giám sát/tái chứng nhận được tính từ ngày công chứng nhận lần đầu cuối cùng,
    // sau toàn bộ điều chỉnh MD5/MD11. Mỗi cuộc đánh giá tối thiểu 1 MD.
    return Math.max(1, this.roundToHalf(initialMandays * ratio));
  }

  private identifyFamily(standard: string): 'QMS' | 'EMS' | 'OHSMS' | null {
    const normalized = standard.toUpperCase().replace(/\s+/g, ' ');
    if (normalized.includes('9001')) return 'QMS';
    if (normalized.includes('14001')) return 'EMS';
    if (normalized.includes('45001')) return 'OHSMS';
    return null;
  }

  private bandFor(personnel: number): PersonnelBand {
    const found = this.bands.find((band) => personnel <= band.maximum);
    if (found) return found;

    const last = this.bands[this.bands.length - 1];
    const extraSteps = Math.ceil((personnel - last.maximum) / 2500);
    return {
      maximum: Number.MAX_SAFE_INTEGER,
      qms: last.qms + extraSteps,
      ems: {
        high: last.ems.high + extraSteps * 2,
        medium: last.ems.medium + extraSteps * 2,
        low: last.ems.low + extraSteps,
        limited: last.ems.limited + extraSteps,
      },
      ohsms: {
        high: last.ohsms.high + extraSteps * 2,
        medium: last.ohsms.medium + extraSteps * 2,
        low: last.ohsms.low + extraSteps,
      },
    };
  }

  private standardRules(
    standards: string[],
    personnel: number,
    emsComplexity: string,
    ohsmsComplexity: string,
  ): { results: StandardRuleResult[]; unsupported: string[] } {
    const band = this.bandFor(Math.max(1, personnel));
    const results: StandardRuleResult[] = [];
    const unsupported: string[] = [];

    for (const standard of standards) {
      const family = this.identifyFamily(standard);
      if (!family) {
        unsupported.push(standard);
        continue;
      }

      if (family === 'QMS') {
        results.push({ standard, family, mandays: band.qms });
      } else if (family === 'EMS') {
        const complexity = ['high', 'medium', 'low', 'limited'].includes(emsComplexity)
          ? (emsComplexity as 'high' | 'medium' | 'low' | 'limited')
          : 'medium';
        results.push({ standard, family, complexity, mandays: band.ems[complexity] });
      } else {
        const complexity = ['high', 'medium', 'low'].includes(ohsmsComplexity)
          ? (ohsmsComplexity as 'high' | 'medium' | 'low')
          : 'medium';
        results.push({ standard, family, complexity, mandays: band.ohsms[complexity] });
      }
    }

    return { results, unsupported };
  }

  private ceilBracket(value: number, brackets: number[]): number {
    if (value <= 0) return 0;
    return brackets.find((item) => value <= item) ?? brackets[brackets.length - 1];
  }

  private calculateImsReduction(integration: number, capability: number): number {
    if (integration <= 0 || capability <= 0) return 0;

    const integrationBracket = this.ceilBracket(integration, [20, 40, 60, 80, 100]);
    const capabilityBracket = this.ceilBracket(capability, [20, 40, 60, 80, 100]);
    const column = [20, 40, 60, 80, 100].indexOf(capabilityBracket);
    const matrix: Record<number, number[]> = {
      20: [0, 0, 0, 0, 0],
      40: [0, 5, 5, 5, 5],
      60: [0, 5, 10, 10, 10],
      80: [0, 5, 10, 15, 15],
      100: [0, 5, 10, 15, 20],
    };

    return matrix[integrationBracket]?.[Math.max(0, column)] ?? 0;
  }

  private calculateSiteCoverage(
    dto: SuggestMandayDto,
    warnings: string[],
  ) {
    const sites = (dto.sites ?? []).filter((site) => site !== null && site !== undefined);
    const totalSites = Math.max(1, sites.length || 1);
    const mode = totalSites <= 1 ? 'single' : (dto.site_sampling_mode ?? 'sampling');
    const auditType = dto.audit_type ?? 'initial';
    const nonCentralCount = Math.max(0, totalSites - 1);

    let sampledNonCentral = 0;
    if (mode === 'single') {
      sampledNonCentral = 0;
    } else if (mode === 'non_sampling') {
      sampledNonCentral = auditType === 'surveillance'
        ? Math.ceil(nonCentralCount * 0.3)
        : nonCentralCount;
    } else if (auditType === 'surveillance') {
      sampledNonCentral = Math.ceil(0.6 * Math.sqrt(nonCentralCount));
    } else if (auditType === 'recertification' && dto.system_effective_over_cycle) {
      sampledNonCentral = Math.ceil(0.8 * Math.sqrt(nonCentralCount));
    } else {
      sampledNonCentral = Math.ceil(Math.sqrt(nonCentralCount));
    }

    sampledNonCentral = Math.min(nonCentralCount, Math.max(0, sampledNonCentral));
    const auditedSites = Math.min(totalSites, 1 + sampledNonCentral);

    if (totalSites > 1 && mode === 'sampling') {
      warnings.push('Số địa điểm lấy mẫu là đề xuất tối thiểu. Việc đủ điều kiện lấy mẫu phải được xác nhận theo tính tương đồng của quá trình và kết quả phân tích rủi ro.');
    }
    if (
      totalSites > 1 &&
      mode === 'sampling' &&
      dto.sampled_site_reduction_percent === undefined
    ) {
      warnings.push('Chưa áp dụng giảm thời lượng tại địa điểm lấy mẫu. Người xem xét phải nhập tỷ lệ giảm có căn cứ; mức giảm không được vượt quá 50%.');
    }

    return {
      totalSites,
      mode,
      sampledNonCentral,
      auditedSites,
      sampledSiteReductionPercent: Math.min(
        50,
        Math.max(0, Number(dto.sampled_site_reduction_percent ?? 0)),
      ),
      sites,
    };
  }

  private distributePersonnel(
    sites: MandaySiteInputDto[],
    effectivePersonnel: number,
    warnings: string[],
  ): number[] {
    const normalizedEffectivePersonnel = Math.max(1, Number(effectivePersonnel || 1));

    if (!sites.length) return [normalizedEffectivePersonnel];

    // Với một địa điểm, số nhân sự dùng để dò bảng phải là nhân sự hiệu dụng
    // của toàn tổ chức. Không để giá trị mặc định của địa điểm ghi đè lên số
    // nhân sự hiệu dụng đã được xem xét.
    if (sites.length === 1) {
      const sitePersonnel = Number(sites[0]?.employee_count ?? 0);
      if (
        Number.isFinite(sitePersonnel) &&
        sitePersonnel > 0 &&
        sitePersonnel !== normalizedEffectivePersonnel
      ) {
        warnings.push(
          `Nhân sự tại địa điểm duy nhất (${sitePersonnel}) khác nhân sự hiệu dụng (${normalizedEffectivePersonnel}); hệ thống sử dụng nhân sự hiệu dụng để tra bảng IAF.`,
        );
      }
      return [normalizedEffectivePersonnel];
    }

    const explicit = sites.map((site) => {
      const value = Number(site.employee_count);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    });
    const explicitTotal = explicit.reduce((sum, value) => sum + value, 0);
    const missingIndexes = sites
      .map((site, index) => (
        site.employee_count === null ||
        site.employee_count === undefined ||
        Number(site.employee_count) <= 0
          ? index
          : -1
      ))
      .filter((index) => index >= 0);

    if (missingIndexes.length) {
      const remaining = Math.max(0, normalizedEffectivePersonnel - explicitTotal);
      const baseShare = Math.floor(remaining / missingIndexes.length);
      let remainder = remaining - baseShare * missingIndexes.length;

      return explicit.map((value, index) => {
        if (!missingIndexes.includes(index)) return Math.max(1, value);
        const allocated = baseShare + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        return Math.max(1, allocated);
      });
    }

    if (explicitTotal === normalizedEffectivePersonnel) {
      return explicit.map((value) => Math.max(1, value));
    }

    warnings.push(
      `Tổng nhân sự các địa điểm (${explicitTotal}) khác nhân sự hiệu dụng (${normalizedEffectivePersonnel}); hệ thống đã chuẩn hóa theo tỷ trọng từng địa điểm để tra bảng IAF.`,
    );

    if (explicitTotal <= 0) {
      const baseShare = Math.floor(normalizedEffectivePersonnel / sites.length);
      let remainder = normalizedEffectivePersonnel - baseShare * sites.length;
      return sites.map(() => {
        const allocated = baseShare + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        return Math.max(1, allocated);
      });
    }

    const scaled = explicit.map((value) =>
      Math.max(1, Math.floor((value / explicitTotal) * normalizedEffectivePersonnel)),
    );
    const difference = normalizedEffectivePersonnel - scaled.reduce((sum, value) => sum + value, 0);

    const centralIndex = Math.max(
      0,
      sites.findIndex((site) => site.is_headquarters),
    );
    scaled[centralIndex] = Math.max(1, scaled[centralIndex] + difference);

    return scaled;
  }

  suggest(dto: SuggestMandayDto) {
    const standards = Array.from(new Set((dto.standards ?? []).map((item) => item.trim()).filter(Boolean)));
    if (!standards.length) {
      throw new BadRequestException('Phải có ít nhất một tiêu chuẩn được hỗ trợ');
    }

    const warnings: string[] = [];
    const auditType = dto.audit_type ?? 'initial';
    const emsComplexity = dto.ems_complexity ?? 'medium';
    const ohsmsComplexity = dto.ohsms_complexity ?? 'medium';
    const siteCoverage = this.calculateSiteCoverage(dto, warnings);
    const personnelBySite = this.distributePersonnel(siteCoverage.sites, dto.effective_personnel, warnings);

    const centralIndex = Math.max(0, siteCoverage.sites.findIndex((site) => site.is_headquarters));
    const candidateIndexes = personnelBySite
      .map((personnel, index) => ({ personnel, index }))
      .filter((item) => item.index !== centralIndex)
      .sort((a, b) => b.personnel - a.personnel)
      .slice(0, siteCoverage.sampledNonCentral)
      .map((item) => item.index);
    const auditedIndexes = Array.from(new Set([centralIndex, ...candidateIndexes]));

    const perSite = auditedIndexes.map((siteIndex, order) => {
      const personnel = personnelBySite[siteIndex] ?? dto.effective_personnel;
      const rules = this.standardRules(standards, personnel, emsComplexity, ohsmsComplexity);
      const raw = rules.results.reduce((sum, item) => sum + item.mandays, 0);
      const isCentral = siteIndex === centralIndex || order === 0;
      const siteReduction = isCentral ? 0 : siteCoverage.sampledSiteReductionPercent;
      return {
        site_index: siteIndex,
        site_name: siteCoverage.sites[siteIndex]?.site_name ?? `Địa điểm ${siteIndex + 1}`,
        is_central: isCentral,
        effective_personnel: personnel,
        standards: rules.results,
        raw_mandays: this.round2(raw),
        sampled_site_reduction_percent: siteReduction,
        mandays_after_site_reduction: this.round2(raw * (1 - siteReduction / 100)),
        unsupported_standards: rules.unsupported,
      };
    });

    if (!siteCoverage.sites.length) {
      const rules = this.standardRules(standards, dto.effective_personnel, emsComplexity, ohsmsComplexity);
      perSite.splice(0, perSite.length, {
        site_index: 0,
        site_name: 'Tổ chức',
        is_central: true,
        effective_personnel: dto.effective_personnel,
        standards: rules.results,
        raw_mandays: this.round2(rules.results.reduce((sum, item) => sum + item.mandays, 0)),
        sampled_site_reduction_percent: 0,
        mandays_after_site_reduction: this.round2(rules.results.reduce((sum, item) => sum + item.mandays, 0)),
        unsupported_standards: rules.unsupported,
      });
    }

    const unsupportedStandards = Array.from(new Set(perSite.flatMap((site) => site.unsupported_standards)));
    if (unsupportedStandards.length) {
      warnings.push(`Chưa có bảng tự động cho: ${unsupportedStandards.join(', ')}. Các tiêu chuẩn này chưa được cộng vào đề xuất.`);
    }

    const rawStartingPoint = perSite.reduce((sum, site) => sum + site.mandays_after_site_reduction, 0);
    const roundedStartingPoint = this.roundToHalf(rawStartingPoint);
    const increasePercent = Math.max(0, Number(dto.increase_percent ?? 0));
    const reductionPercent = Math.min(30, Math.max(0, Number(dto.reduction_percent ?? 0)));
    const calculatedImsReduction = standards.length > 1
      ? this.calculateImsReduction(
          Number(dto.ims_integration_percent ?? 0),
          Number(dto.combined_audit_capability_percent ?? 0),
        )
      : 0;
    const imsReductionPercent = standards.length > 1
      ? Math.min(20, Math.max(0, Number(dto.ims_reduction_percent ?? calculatedImsReduction)))
      : 0;

    if (increasePercent > 30) {
      warnings.push('Tổng tỷ lệ tăng vượt mức khuyến nghị 30%; hệ thống vẫn cho phép nhưng bắt buộc phải có căn cứ và phê duyệt.');
    }

    const generalAdjustmentFactor = 1 + increasePercent / 100 - reductionPercent / 100;
    const imsAdjustmentFactor = 1 - imsReductionPercent / 100;
    const calculatedInitial = this.roundToHalf(
      roundedStartingPoint * generalAdjustmentFactor * imsAdjustmentFactor,
    );
    if (calculatedInitial <= 0) {
      throw new BadRequestException('Ngày công sau điều chỉnh phải lớn hơn 0');
    }

    // Mỗi phần đánh giá được bố trí theo bước 0,5 MD.
    // Stage 1 có thể là 0,5 MD; Stage 2 và các cuộc đánh giá độc lập không thấp hơn 1 MD.
    const stage1 = Math.max(0.5, this.roundToHalf(calculatedInitial * 0.2));
    const stage2 = Math.max(1, this.roundToHalf(calculatedInitial - stage1));
    const initialFinal = this.round2(stage1 + stage2);
    const surveillanceMandays = this.cycleAuditMandays(initialFinal, 1 / 3);
    const recertificationMandays = this.cycleAuditMandays(initialFinal, 2 / 3);

    return {
      method: standards.length > 1 ? 'IAF_MD11' : 'IAF_MD5',
      audit_type: auditType,
      supported_scope: ['ISO 9001', 'ISO 14001', 'ISO 45001', 'IMS', 'MULTI_SITE'],
      effective_personnel: dto.effective_personnel,
      standards,
      ems_complexity: emsComplexity,
      ohsms_complexity: ohsmsComplexity,
      site_calculation: {
        total_sites: siteCoverage.totalSites,
        sampling_mode: siteCoverage.mode,
        sampled_non_central_sites: siteCoverage.sampledNonCentral,
        total_audited_sites: siteCoverage.auditedSites,
        sampled_site_reduction_percent: siteCoverage.sampledSiteReductionPercent,
        per_site: perSite,
      },
      starting_point_raw: this.round2(rawStartingPoint),
      base_mandays: roundedStartingPoint,
      rounding_rule: 'Làm tròn về bội số 0,5 gần nhất sau khi xác định tổng ngày công lần đầu trước mọi điều chỉnh.',
      increase_percent: this.round2(increasePercent),
      reduction_percent: this.round2(reductionPercent),
      ims_integration_percent: this.round2(Number(dto.ims_integration_percent ?? 0)),
      combined_audit_capability_percent: this.round2(Number(dto.combined_audit_capability_percent ?? 0)),
      calculated_ims_reduction_percent: calculatedImsReduction,
      ims_reduction_percent: imsReductionPercent,
      final_initial_mandays: initialFinal,
      stage1_mandays: stage1,
      stage2_mandays: stage2,
      stage_split_note: 'Đề xuất Stage 2 khoảng 80%; Stage 1 là phần còn lại. Stage 1 tối thiểu 0,5 MD; Stage 2, giám sát và tái chứng nhận tối thiểu 1 MD.',
      surveillance_mandays: surveillanceMandays,
      surveillance_ratio: 1 / 3,
      surveillance_rule: 'Giám sát hằng năm dự kiến = 1/3 ngày công chứng nhận lần đầu sau điều chỉnh; làm tròn về 0,5 MD gần nhất; tối thiểu 1 MD.',
      recertification_mandays: recertificationMandays,
      recertification_ratio: 2 / 3,
      recertification_requires_recalculation: true,
      recertification_rule: 'Tái chứng nhận 2/3 chỉ là dự kiến lập chương trình; trước tái chứng nhận phải tính lại theo nhân sự, phạm vi, độ phức tạp và địa điểm hiện hành.',
      warnings,
    };
  }
}
