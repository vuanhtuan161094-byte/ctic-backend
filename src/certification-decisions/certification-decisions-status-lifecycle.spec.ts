import {
    BadRequestException,
    ConflictException,
} from '@nestjs/common';

import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { CertificationDecisionsController } from './certification-decisions.controller';
import { CertificationDecisionsService } from './certification-decisions.service';
import type { CreateCertificationDecisionDto } from './dto/create-certification-decision.dto';

type StatusDecisionType =
    | 'SUSPEND'
    | 'RESTORE'
    | 'WITHDRAW';

function createHarness(input: {
    certificateStatus?: string;
    expireDate?: Date | null;
    guardedUpdateCount?: number;
    existingDecision?: boolean;
    transactionNotBegunOnce?: boolean;
} = {}) {
    const decisionId =
        '00000000-0000-4000-8000-000000000041';
    const certificateId =
        '00000000-0000-4000-8000-000000000042';
    const seriesId =
        '00000000-0000-4000-8000-000000000043';
    const projectId =
        '00000000-0000-4000-8000-000000000044';
    const technicalReviewId =
        '00000000-0000-4000-8000-000000000045';
    const createdBy =
        '00000000-0000-4000-8000-000000000046';
    const certificate = {
        id:
            certificateId,
        certificate_series_id:
            seriesId,
        version_no:
            3,
        status:
            input.certificateStatus ??
            'active',
        expire_date:
            input.expireDate === undefined
                ? new Date('2029-12-31T00:00:00.000Z')
                : input.expireDate,
        verification_code:
            '00000000-0000-4000-8000-000000000047',
    };
    const transaction = {
        certification_decisions: {
            create:
                jest.fn(async ({ data }: any) => ({
                    id:
                        decisionId,
                    ...data,
                    created_at:
                        new Date('2026-08-21T01:00:00.000Z'),
                    updated_at:
                        new Date('2026-08-21T01:00:00.000Z'),
                    technical_reviews:
                        {},
                    certificate_series:
                        {},
                    certificates:
                        [],
                })),
        },
        certificates: {
            findFirst:
                jest.fn(async () => certificate),
            updateMany:
                jest.fn(async () => ({
                    count:
                        input.guardedUpdateCount ??
                        1,
                })),
        },
        certificate_status_histories: {
            create:
                jest.fn(async ({ data }: any) => data),
        },
        certification_projects: {
            update:
                jest.fn(async () => ({})),
        },
    };
    const prisma = {
        certification_decisions: {
            findFirst:
                jest.fn(async () =>
                    input.existingDecision
                        ? {
                            id:
                                decisionId,
                        }
                        : null),
        },
        technical_reviews: {
            findUnique:
                jest.fn(async () => ({
                    id:
                        technicalReviewId,
                    status:
                        'completed',
                    form_data:
                        JSON.stringify({
                            technical_review_report: {
                                recommendation:
                                    'status_action_recommended',
                            },
                        }),
                    reports: {
                        audit_plan_id:
                            '00000000-0000-4000-8000-000000000048',
                        audit_plans: {
                            audit_type:
                                'surveillance1',
                            audit_event: {
                                event_type:
                                    'surveillance1',
                            },
                            certification_projects: {
                                id:
                                    projectId,
                                standard_name:
                                    'ISO 9001:2015',
                                certification_applications: {
                                    certification_type:
                                        'surveillance',
                                    company_name_en:
                                        null,
                                    standard_name:
                                        'ISO 9001:2015',
                                    certification_scope:
                                        'Manufacturing',
                                    sites:
                                        [],
                                    customers: {
                                        company_name:
                                            'CTIC Customer',
                                        address:
                                            'Ha Noi',
                                    },
                                },
                            },
                        },
                    },
                })),
        },
        certificate_series: {
            findFirst:
                jest.fn(async () => ({
                    id:
                        seriesId,
                    status:
                        'active',
                })),
        },
        $transaction:
            jest.fn(
                (() => {
                    let transactionAttempt = 0;

                    return async (callback: any) => {
                        transactionAttempt += 1;

                        if (
                            input.transactionNotBegunOnce &&
                            transactionAttempt === 1
                        ) {
                            const error =
                                new Error(
                                    'Transaction has not begun. Call begin() first.',
                                ) as Error & {
                                    code?: string;
                                };
                            error.code =
                                'ENOTBEGUN';

                            throw error;
                        }

                        return callback(transaction);
                    };
                })(),
            ),
    };

    const service =
        new CertificationDecisionsService(
            prisma as any,
        );

    function dto(
        decisionType: StatusDecisionType,
        decisionResult:
            | 'approved'
            | 'rejected'
            | 'deferred' =
            'approved',
        effectiveDate =
            '2026-08-21',
    ): CreateCertificationDecisionDto {
        return {
            technical_review_id:
                technicalReviewId,
            certificate_series_id:
                seriesId,
            decision_number:
                `QD-${decisionType}-${decisionResult}`,
            decision_date:
                '2026-08-21',
            decision_type:
                decisionType,
            decision_result:
                decisionResult,
            organization_name:
                'CTIC Customer',
            organization_address:
                'Ha Noi',
            management_system:
                'QMS',
            standard_name:
                'ISO 9001:2015',
            certification_scope:
                'Manufacturing',
            change_reason:
                `Căn cứ thực hiện ${decisionType}`,
            effective_date:
                effectiveDate,
            surveillance_interval_months:
                12,
            signatory_name:
                'Decision Maker',
            signatory_title:
                'Giám đốc chứng nhận',
        };
    }

    return {
        certificate,
        certificateId,
        createdBy,
        decisionId,
        dto,
        prisma,
        service,
        transaction,
    };
}

describe('certification decision certificate status lifecycle', () => {
    it('retries the whole Serializable transaction once when SQL reports ENOTBEGUN', async () => {
        const harness =
            createHarness({
                certificateStatus:
                    'active',
                transactionNotBegunOnce:
                    true,
            });

        const decision =
            await harness.service.create(
                harness.dto(
                    'SUSPEND',
                ),
                harness.createdBy,
            );

        expect(
            decision.id,
        ).toBe(
            harness.decisionId,
        );
        expect(
            harness.prisma.$transaction,
        ).toHaveBeenCalledTimes(
            2,
        );
    });

    it.each([
        ['active', 'SUSPEND', 'suspended'],
        ['suspended', 'RESTORE', 'active'],
        ['active', 'WITHDRAW', 'withdrawn'],
        ['suspended', 'WITHDRAW', 'withdrawn'],
    ] as const)(
        'allows %s through approved %s and targets %s',
        async (
            certificateStatus,
            decisionType,
            targetStatus,
        ) => {
            const harness =
                createHarness({
                    certificateStatus,
                });

            await harness.service.create(
                harness.dto(
                    decisionType,
                ),
                harness.createdBy,
            );

            expect(
                harness.transaction
                    .certificates
                    .updateMany,
            ).toHaveBeenCalledWith({
                where: {
                    id:
                        harness.certificateId,
                    status:
                        certificateStatus,
                },
                data: {
                    status:
                        targetStatus,
                    updated_at:
                        expect.any(Date),
                },
            });
        },
    );

    it.each([
        ['suspended', 'SUSPEND'],
        ['active', 'RESTORE'],
        ['withdrawn', 'RESTORE'],
        ['expired', 'RESTORE'],
        ['replaced', 'WITHDRAW'],
    ] as const)(
        'rejects %s certificate for %s',
        async (
            certificateStatus,
            decisionType,
        ) => {
            const harness =
                createHarness({
                    certificateStatus,
                });

            await expect(
                harness.service.create(
                    harness.dto(
                        decisionType,
                    ),
                    harness.createdBy,
                ),
            ).rejects.toBeInstanceOf(
                BadRequestException,
            );
            expect(
                harness.transaction
                    .certificate_status_histories
                    .create,
            ).not.toHaveBeenCalled();
        },
    );

    it('rejects RESTORE when the effective date is after certificate expiry', async () => {
        const harness =
            createHarness({
                certificateStatus:
                    'suspended',
                expireDate:
                    new Date('2026-08-25T00:00:00.000Z'),
            });

        await expect(
            harness.service.create(
                harness.dto(
                    'RESTORE',
                    'approved',
                    '2026-08-26',
                ),
                harness.createdBy,
            ),
        ).rejects.toThrow(
            'sau ngày hết hiệu lực',
        );
    });

    it('rejects RESTORE when expiry cannot be validated', async () => {
        const harness =
            createHarness({
                certificateStatus:
                    'suspended',
                expireDate:
                    null,
            });

        await expect(
            harness.service.create(
                harness.dto(
                    'RESTORE',
                ),
                harness.createdBy,
            ),
        ).rejects.toThrow(
            'chưa có ngày hết hiệu lực',
        );
    });

    it.each([
        'rejected',
        'deferred',
    ] as const)(
        '%s status decision causes no certificate mutation or history',
        async (decisionResult) => {
            const harness =
                createHarness();

            await harness.service.create(
                harness.dto(
                    'SUSPEND',
                    decisionResult,
                ),
                harness.createdBy,
            );

            expect(
                harness.transaction
                    .certificates
                    .updateMany,
            ).not.toHaveBeenCalled();
            expect(
                harness.transaction
                    .certificate_status_histories
                    .create,
            ).not.toHaveBeenCalled();
        },
    );

    it('writes exactly one decision-linked history record with the business reason', async () => {
        const harness =
            createHarness();
        const dto =
            harness.dto(
                'SUSPEND',
            );

        await harness.service.create(
            dto,
            harness.createdBy,
        );

        expect(
            harness.transaction
                .certificate_status_histories
                .create,
        ).toHaveBeenCalledTimes(1);
        expect(
            harness.transaction
                .certificate_status_histories
                .create,
        ).toHaveBeenCalledWith({
            data: {
                certificate_id:
                    harness.certificateId,
                certification_decision_id:
                    harness.decisionId,
                changed_by:
                    harness.createdBy,
                effective_date:
                    new Date('2026-08-21T00:00:00.000Z'),
                from_status:
                    'active',
                reason:
                    dto.change_reason,
                to_status:
                    'suspended',
            },
        });
    });

    it('uses a guarded status update and rolls back stale concurrent execution', async () => {
        const harness =
            createHarness({
                guardedUpdateCount:
                    0,
            });

        await expect(
            harness.service.create(
                harness.dto(
                    'WITHDRAW',
                ),
                harness.createdBy,
            ),
        ).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(
            harness.transaction
                .certificate_status_histories
                .create,
        ).not.toHaveBeenCalled();
    });

    it('rejects repeated decision execution before creating duplicate history', async () => {
        const harness =
            createHarness({
                existingDecision:
                    true,
            });

        await expect(
            harness.service.create(
                harness.dto(
                    'SUSPEND',
                ),
                harness.createdBy,
            ),
        ).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(
            harness.prisma.$transaction,
        ).not.toHaveBeenCalled();
    });

    it.each([
        'SUSPEND',
        'RESTORE',
        'WITHDRAW',
    ] as const)(
        '%s preserves version, verification code, and document ownership',
        async (decisionType) => {
            const harness =
                createHarness({
                    certificateStatus:
                        decisionType === 'RESTORE'
                            ? 'suspended'
                            : 'active',
                });
            const originalVersion =
                harness.certificate.version_no;
            const originalVerificationCode =
                harness.certificate.verification_code;

            await harness.service.create(
                harness.dto(
                    decisionType,
                ),
                harness.createdBy,
            );

            const update =
                harness.transaction
                    .certificates
                    .updateMany
                    .mock.calls[0][0];
            expect(update.data).toEqual({
                status:
                    decisionType === 'SUSPEND'
                        ? 'suspended'
                        : decisionType === 'RESTORE'
                            ? 'active'
                            : 'withdrawn',
                updated_at:
                    expect.any(Date),
            });
            expect(update.data).not.toHaveProperty(
                'version_no',
            );
            expect(update.data).not.toHaveProperty(
                'verification_code',
            );
            expect(
                harness.certificate.version_no,
            ).toBe(
                originalVersion,
            );
            expect(
                harness.certificate.verification_code,
            ).toBe(
                originalVerificationCode,
            );
            expect(
                harness.transaction,
            ).not.toHaveProperty(
                'documentFile',
            );
        },
    );

    it('requires reason and effective date for lifecycle status decisions', async () => {
        const missingReason =
            createHarness();
        const reasonDto =
            missingReason.dto(
                'SUSPEND',
            );
        reasonDto.change_reason =
            ' ';
        await expect(
            missingReason.service.create(
                reasonDto,
                missingReason.createdBy,
            ),
        ).rejects.toThrow(
            'lý do đình chỉ',
        );

        const missingDate =
            createHarness();
        const dateDto =
            missingDate.dto(
                'WITHDRAW',
            );
        dateDto.effective_date =
            undefined;
        await expect(
            missingDate.service.create(
                dateDto,
                missingDate.createdBy,
            ),
        ).rejects.toThrow(
            'phải có ngày hiệu lực',
        );
    });

    it('keeps status decision mutation restricted to decision authority', () => {
        const roles =
            Reflect.getMetadata(
                ROLES_KEY,
                CertificationDecisionsController
                    .prototype
                    .create,
            );
        const permissions =
            Reflect.getMetadata(
                PERMISSIONS_KEY,
                CertificationDecisionsController
                    .prototype
                    .create,
            );

        expect(roles).toEqual([
            'DECISION_MAKER',
        ]);
        expect(permissions).toEqual([
            'certification_decisions.issue',
        ]);
        for (const readOnlyRole of [
            'AUDITOR',
            'LEAD_AUDITOR',
            'TECHNICAL_REVIEWER',
            'CUSTOMER',
        ]) {
            expect(roles).not.toContain(
                readOnlyRole,
            );
        }
    });
});
