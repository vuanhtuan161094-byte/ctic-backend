import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { CertificatesService } from './certificates.service';

const baseDecision = {
    id: 'decision-1',
    status: 'issued',
    decision_result: 'approved',
    decision_type: 'GRANT',
    certificate_series_id: null,
    effective_date: new Date('2026-08-21T00:00:00.000Z'),
    expiry_date: new Date('2029-08-20T00:00:00.000Z'),
    organization_name: 'CTIC Test Customer',
    organization_address: 'Hai Phong',
    management_system: 'QMS',
    standard_name: 'ISO 9001:2015',
    certification_scope: 'Manufacturing',
    form_data: JSON.stringify({
        approved_site_snapshot_json: JSON.stringify([{
            site_no: 1,
            site_name: 'Approved recertification site',
            address: 'New approved site address',
            activities: 'Manufacturing and service',
            employee_count: 25,
            is_headquarters: true,
        }]),
    }),
};

function reviewFor(
    decisionType: string,
    seriesId: string | null = null,
) {
    return {
        id: 'review-1',
        status: 'completed',
        certification_decision: {
            ...baseDecision,
            decision_type: decisionType,
            certificate_series_id: seriesId,
        },
        audit_result_notification: {
            status: 'sent',
            notification_result: decisionType === 'GRANT'
                ? 'certification_granted'
                : 'certification_maintained',
        },
        reports: {
            audit_plans: {
                certification_projects: {
                    id: 'project-1',
                    project_code: 'PRJ-TEST-001',
                    certification_applications: {
                        sites: [{
                            site_no: 1,
                            site_name: 'Head office',
                            address: 'Hai Phong',
                            activities: 'Manufacturing',
                            employee_count: 10,
                            is_headquarters: true,
                        }],
                    },
                },
            },
        },
    };
}

function createHarness(input: {
    decisionType: string;
    seriesId?: string | null;
    previousCertificate?: Record<string, unknown> | null;
}) {
    const createdCertificate = {
        id: 'certificate-new',
        verification_code: 'verification-new',
        cert_number: 'CERT-001',
        version_no: input.previousCertificate ? 2 : 1,
        status: 'active',
    };
    const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: input.seriesId ?? 'series-new' }]),
        certificate_series: {
            create: jest.fn().mockResolvedValue({
                id: 'series-new',
                series_code: 'SER-TEST',
            }),
        },
        certification_decisions: {
            update: jest.fn().mockResolvedValue({}),
        },
        certificates: {
            findFirst: jest.fn().mockResolvedValue(input.previousCertificate ?? null),
            create: jest.fn().mockResolvedValue(createdCertificate),
            update: jest.fn().mockResolvedValue({}),
        },
        certificate_status_histories: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        certification_projects: {
            update: jest.fn().mockResolvedValue({}),
        },
    };
    const prisma = {
        certificates: {
            findFirst: jest.fn().mockResolvedValue(null),
        },
        technical_reviews: {
            findUnique: jest.fn().mockResolvedValue(
                reviewFor(
                    input.decisionType,
                    input.seriesId ?? null,
                ),
            ),
        },
        $transaction: jest.fn((work, options) =>
            work(transaction).then((result: unknown) => ({
                result,
                options,
            })),
        ),
    };
    const service = new CertificatesService(
        prisma as never,
        {} as never,
    );

    return {
        service,
        prisma,
        transaction,
        createdCertificate,
    };
}

const dto = {
    technical_review_id: 'review-1',
    cert_number: 'CERT-001',
    issue_date: '2026-08-21',
    expire_date: '2029-08-20',
};

describe('CertificatesService series-aware versioning', () => {
    it('creates a Certificate Series and version 1 for first GRANT', async () => {
        const harness = createHarness({ decisionType: 'GRANT' });

        await harness.service.create(dto, 'user-1');

        expect(harness.transaction.certificate_series.create).toHaveBeenCalledTimes(1);
        expect(harness.transaction.certification_decisions.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { certificate_series_id: 'series-new' },
            }),
        );
        expect(harness.transaction.certificates.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    certificate_series_id: 'series-new',
                    certification_decision_id: 'decision-1',
                    version_no: 1,
                    supersedes_certificate_id: null,
                    organization_name: baseDecision.organization_name,
                    standard_name: baseDecision.standard_name,
                    certification_scope: baseDecision.certification_scope,
                }),
            }),
        );
    });

    it('increments version and replaces only the previous version in the same series', async () => {
        const previous = {
            id: 'certificate-series-a-v1',
            certificate_series_id: 'series-a',
            cert_number: 'CERT-001',
            verification_code: 'verification-old',
            version_no: 1,
            status: 'active',
        };
        const harness = createHarness({
            decisionType: 'RECERTIFY',
            seriesId: 'series-a',
            previousCertificate: previous,
        });

        await harness.service.create({
            ...dto,
            change_reason: 'Điều chỉnh thông tin trên chứng chỉ.',
        }, 'user-1');

        expect(harness.transaction.certificates.findFirst).toHaveBeenCalledWith({
            where: { certificate_series_id: 'series-a' },
            orderBy: { version_no: 'desc' },
        });
        expect(harness.transaction.certificates.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    certificate_series_id: 'series-a',
                    version_no: 2,
                    supersedes_certificate_id: previous.id,
                }),
            }),
        );
        expect(harness.transaction.certificates.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: previous.id },
                data: expect.objectContaining({ status: 'replaced' }),
            }),
        );
        expect(harness.transaction.certificates.update)
            .not.toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'certificate-from-another-series' },
            }));
    });

    it('preserves the old verification code and status history while appending replacement history', async () => {
        const previous = {
            id: 'certificate-old',
            certificate_series_id: 'series-a',
            cert_number: 'CERT-001',
            verification_code: 'verification-old',
            version_no: 1,
            status: 'active',
        };
        const harness = createHarness({
            decisionType: 'AMEND',
            seriesId: 'series-a',
            previousCertificate: previous,
        });

        await harness.service.create({
            ...dto,
            change_reason: 'Điều chỉnh thông tin trên chứng chỉ.',
        }, 'user-1');

        const update = harness.transaction.certificates.update.mock.calls[0][0];
        expect(update.data).not.toHaveProperty('verification_code');
        expect(harness.transaction.certificate_status_histories.createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({
                certificate_id: previous.id,
                from_status: 'active',
                to_status: 'replaced',
            })],
        });
        expect(harness.transaction.certificate_status_histories)
            .not.toHaveProperty('deleteMany');
    });

    it('keeps the previous snapshot immutable and writes the approved recertification snapshot', async () => {
        const previous = {
            id: 'certificate-old-snapshot',
            certificate_series_id: 'series-a',
            cert_number: 'CERT-001',
            verification_code: 'verification-old',
            version_no: 2,
            status: 'active',
            organization_name: 'Old Organization',
            certification_scope: 'Old scope',
            site_snapshot_json: JSON.stringify([{
                site_name: 'Old site',
            }]),
        };
        const previousSnapshot = JSON.stringify(previous);
        const harness = createHarness({
            decisionType: 'RECERTIFY',
            seriesId: 'series-a',
            previousCertificate: previous,
        });

        await harness.service.create(dto, 'user-1');

        const create =
            harness.transaction.certificates.create.mock.calls[0][0];
        expect(JSON.parse(create.data.site_snapshot_json))
            .toEqual([
                expect.objectContaining({
                    site_name: 'Approved recertification site',
                    address: 'New approved site address',
                }),
            ]);
        expect(create.data.organization_name)
            .toBe(baseDecision.organization_name);
        expect(create.data.certification_scope)
            .toBe(baseDecision.certification_scope);
        expect(JSON.stringify(previous))
            .toBe(previousSnapshot);
        expect(harness.transaction.certificates.update.mock.calls[0][0].data)
            .toEqual(expect.objectContaining({ status: 'replaced' }));
        expect(harness.transaction.certificates.update.mock.calls[0][0].data)
            .not.toHaveProperty('organization_name');
        expect(harness.createdCertificate.verification_code)
            .not.toBe(previous.verification_code);
    });

    it('does not create a duplicate certificate for MAINTAIN or REFUSE', async () => {
        for (const decisionType of ['MAINTAIN', 'REFUSE']) {
            const harness = createHarness({
                decisionType,
                seriesId: decisionType === 'MAINTAIN' ? 'series-a' : null,
            });

            await expect(harness.service.create(dto, 'user-1'))
                .rejects.toBeInstanceOf(BadRequestException);
            expect(harness.prisma.$transaction).not.toHaveBeenCalled();
        }
    });

    it('rejects AMEND issuance when no change reason was confirmed', async () => {
        const harness = createHarness({
            decisionType: 'AMEND',
            seriesId: 'series-a',
        });

        await expect(harness.service.create(dto, 'user-1'))
            .rejects.toThrow('Phải có lý do thay đổi');
        expect(harness.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allocates versions inside a SERIALIZABLE transaction with a series lock', async () => {
        const harness = createHarness({ decisionType: 'GRANT' });

        const wrapped = await harness.service.create(dto, 'user-1') as unknown as {
            options: { isolationLevel: string };
        };

        expect(wrapped.options.isolationLevel)
            .toBe(Prisma.TransactionIsolationLevel.Serializable);
        expect(harness.transaction.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('serializes RECERTIFY version allocation on the existing series', async () => {
        const harness = createHarness({
            decisionType: 'RECERTIFY',
            seriesId: 'series-a',
            previousCertificate: {
                id: 'certificate-v2',
                version_no: 2,
                status: 'active',
            },
        });

        const wrapped = await harness.service.create(dto, 'user-1') as unknown as {
            options: { isolationLevel: string };
        };

        expect(wrapped.options.isolationLevel)
            .toBe(Prisma.TransactionIsolationLevel.Serializable);
        expect(harness.transaction.$queryRaw)
            .toHaveBeenCalledTimes(1);
        expect(harness.transaction.certificates.create)
            .toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    certificate_series_id: 'series-a',
                    version_no: 3,
                }),
            }));
    });
});
