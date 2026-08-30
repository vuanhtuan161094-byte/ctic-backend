import { BadRequestException } from '@nestjs/common';

import { CertificationDecisionsService } from './certification-decisions.service';
import type { CreateCertificationDecisionDto } from './dto/create-certification-decision.dto';

function createHarness(input: {
    auditType?: string;
    certificateStatus?: string | null;
    hasSeries?: boolean;
} = {}) {
    const seriesId =
        '00000000-0000-4000-8000-000000000141';
    const projectId =
        '00000000-0000-4000-8000-000000000142';
    const reviewId =
        '00000000-0000-4000-8000-000000000143';
    const createdDecision = jest.fn(async ({ data }: any) => ({
        id:
            '00000000-0000-4000-8000-000000000144',
        ...data,
        technical_reviews: {},
        certificate_series: {},
        certificates: [],
    }));
    const transaction = {
        certification_decisions: {
            create:
                createdDecision,
        },
        certification_projects: {
            update:
                jest.fn(async () => ({})),
        },
    };
    const prisma = {
        certification_decisions: {
            findFirst:
                jest.fn(async () => null),
        },
        technical_reviews: {
            findUnique:
                jest.fn(async () => ({
                    id:
                        reviewId,
                    status:
                        'completed',
                    form_data:
                        JSON.stringify({
                            technical_review_report: {
                                recommendation:
                                    'certification_recommended',
                            },
                        }),
                    reports: {
                        audit_plan_id:
                            '00000000-0000-4000-8000-000000000145',
                        audit_plans: {
                            audit_type:
                                input.auditType ??
                                'recertification',
                            audit_event: {
                                event_type:
                                    input.auditType ??
                                    'recertification',
                            },
                            certification_projects: {
                                id:
                                    projectId,
                                standard_name:
                                    'ISO 9001:2015',
                                certification_applications: {
                                    certification_type:
                                        'recertification',
                                    company_name_en:
                                        null,
                                    standard_name:
                                        'ISO 9001:2015',
                                    certification_scope:
                                        'New approved scope',
                                    customers: {
                                        company_name:
                                            'Recertified Organization',
                                        address:
                                            'New approved address',
                                    },
                                    sites: [{
                                        site_no: 1,
                                        site_name:
                                            'Approved recertification site',
                                        address:
                                            'New approved site address',
                                        activities:
                                            'Manufacturing',
                                        employee_count:
                                            25,
                                        is_headquarters:
                                            true,
                                    }],
                                },
                            },
                        },
                    },
                })),
        },
        certificate_series: {
            findFirst:
                jest.fn(async () => input.hasSeries === false
                    ? null
                    : {
                        id:
                            seriesId,
                        status:
                            'active',
                    }),
            findMany:
                jest.fn(async () => input.hasSeries === false
                    ? []
                    : [{ id: seriesId }]),
        },
        certificates: {
            findFirst:
                jest.fn(async () => input.certificateStatus === null
                    ? null
                    : {
                        id:
                            '00000000-0000-4000-8000-000000000146',
                        status:
                            input.certificateStatus ??
                            'active',
                    }),
        },
        $transaction:
            jest.fn(async (callback: any) =>
                callback(transaction),
            ),
    };
    const service =
        new CertificationDecisionsService(
            prisma as never,
        );
    const dto: CreateCertificationDecisionDto = {
        technical_review_id:
            reviewId,
        certificate_series_id:
            seriesId,
        decision_number:
            'QD-RECERT-001',
        decision_date:
            '2026-08-21',
        decision_type:
            'RECERTIFY',
        decision_result:
            'approved',
        organization_name:
            'Recertified Organization',
        organization_address:
            'New approved address',
        management_system:
            'QMS',
        standard_name:
            'ISO 9001:2015',
        certification_scope:
            'New approved scope',
        effective_date:
            '2026-09-01',
        expiry_date:
            '2029-08-31',
        surveillance_interval_months:
            12,
        signatory_name:
            'Decision Maker',
        signatory_title:
            'Giám đốc chứng nhận',
    };

    return {
        createdDecision,
        dto,
        prisma,
        seriesId,
        service,
    };
}

describe('CertificationDecisionsService recertification eligibility', () => {
    it('allows RECERTIFY for an active certificate in a recertification cycle', async () => {
        const harness = createHarness();

        await expect(
            harness.service.create(
                harness.dto,
                '00000000-0000-4000-8000-000000000147',
            ),
        ).resolves.toEqual(
            expect.objectContaining({
                decision_type:
                    'RECERTIFY',
                certificate_series_id:
                    harness.seriesId,
            }),
        );
    });

    it.each([
        'stage2',
        'surveillance1',
    ])('rejects RECERTIFY for %s lifecycle', async (auditType) => {
        const harness = createHarness({ auditType });

        await expect(
            harness.service.create(
                harness.dto,
            ),
        ).rejects.toThrow(
            'không phù hợp với lifecycle',
        );
        expect(harness.prisma.$transaction)
            .not.toHaveBeenCalled();
    });

    it('requires an existing certificate series and version', async () => {
        const missingSeries = createHarness({
            hasSeries:
                false,
        });
        missingSeries.dto.certificate_series_id =
            undefined;
        await expect(
            missingSeries.service.create(
                missingSeries.dto,
            ),
        ).rejects.toThrow(
            'yêu cầu Certificate Series hiện hữu',
        );

        const missingVersion = createHarness({
            certificateStatus:
                null,
        });
        await expect(
            missingVersion.service.create(
                missingVersion.dto,
            ),
        ).rejects.toThrow(
            'certificate version hiện hữu',
        );
    });

    it.each([
        'suspended',
        'withdrawn',
        'expired',
        'replaced',
    ])('rejects RECERTIFY from %s certificate state', async (certificateStatus) => {
        const harness = createHarness({ certificateStatus });

        await expect(
            harness.service.create(
                harness.dto,
            ),
        ).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(harness.prisma.$transaction)
            .not.toHaveBeenCalled();
    });

    it('freezes approved recertification sites in decision form data', async () => {
        const harness = createHarness();

        await harness.service.create(
            harness.dto,
        );

        const data =
            harness.createdDecision.mock.calls[0][0].data;
        const formData =
            JSON.parse(data.form_data);
        const sites =
            JSON.parse(
                formData.approved_site_snapshot_json,
            );
        expect(sites).toEqual([
            expect.objectContaining({
                site_name:
                    'Approved recertification site',
                address:
                    'New approved site address',
            }),
        ]);
    });
});
