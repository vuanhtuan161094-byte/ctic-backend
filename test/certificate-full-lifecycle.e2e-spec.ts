import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { CertificatesService } from '../src/certificates/certificates.service';
import { CertificationDecisionsService } from '../src/certification-decisions/certification-decisions.service';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(120_000);

function databaseName(url: string) {
    const part = url.split(';').find((item) =>
        /^(database|initial catalog)=/i.test(item.trim()),
    );
    return part?.slice(part.indexOf('=') + 1).replace(/^\{|\}$/g, '') ?? '';
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const configuredDatabaseName = databaseName(testDatabaseUrl);
const safeTestDatabase =
    configuredDatabaseName.toLowerCase().endsWith('_test') ||
    configuredDatabaseName.toLowerCase().endsWith('_ci');

if (testDatabaseUrl && !safeTestDatabase) {
    throw new Error(
        `[CERTIFICATE LIFECYCLE E2E SAFETY] Refusing non-test database ${configuredDatabaseName || '<missing>'}`,
    );
}

if (safeTestDatabase) {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.NODE_ENV = 'test';
}

const describeRealDatabase = safeTestDatabase ? describe : describe.skip;

describeRealDatabase('Phase 1 certificate full lifecycle (isolated real database)', () => {
    let prisma: PrismaService;
    let decisions: CertificationDecisionsService;
    let certificates: CertificatesService;
    const fixture = {
        userIds: [] as string[],
        customerIds: [] as string[],
        applicationIds: [] as string[],
        siteIds: [] as string[],
        projectIds: [] as string[],
        planIds: [] as string[],
        reportIds: [] as string[],
        reviewIds: [] as string[],
        seriesIds: [] as string[],
        decisionIds: [] as string[],
        certificateIds: [] as string[],
        documentIds: [] as string[],
    };

    async function assertTestDatabase() {
        const rows = await prisma.$queryRawUnsafe<Array<{ database_name: string }>>(
            'SELECT DB_NAME() AS database_name',
        );
        const actual = rows[0]?.database_name ?? '';
        if (
            !actual.toLowerCase().endsWith('_test') &&
            !actual.toLowerCase().endsWith('_ci')
        ) {
            throw new Error(
                `[CERTIFICATE LIFECYCLE E2E SAFETY] Cleanup refused for ${actual || '<unknown>'}`,
            );
        }
    }

    async function cleanup() {
        await assertTestDatabase();
        if (fixture.certificateIds.length) {
            await prisma.certificate_status_histories.deleteMany({
                where: { certificate_id: { in: fixture.certificateIds } },
            });
        }
        if (fixture.documentIds.length) {
            await prisma.documentFile.deleteMany({
                where: { id: { in: fixture.documentIds } },
            });
        }
        if (fixture.reviewIds.length) {
            await prisma.audit_result_notifications.deleteMany({
                where: { technical_review_id: { in: fixture.reviewIds } },
            });
        }
        if (fixture.certificateIds.length) {
            await prisma.certificates.deleteMany({
                where: { id: { in: fixture.certificateIds } },
            });
        }
        if (fixture.decisionIds.length) {
            await prisma.certification_decisions.deleteMany({
                where: { id: { in: fixture.decisionIds } },
            });
        }
        if (fixture.seriesIds.length) {
            await prisma.certificate_series.deleteMany({
                where: { id: { in: fixture.seriesIds } },
            });
        }
        if (fixture.reviewIds.length) {
            await prisma.technical_reviews.deleteMany({
                where: { id: { in: fixture.reviewIds } },
            });
        }
        if (fixture.reportIds.length) {
            await prisma.reports.deleteMany({
                where: { id: { in: fixture.reportIds } },
            });
        }
        if (fixture.planIds.length) {
            await prisma.audit_plans.deleteMany({
                where: { id: { in: fixture.planIds } },
            });
        }
        if (fixture.projectIds.length) {
            await prisma.certification_projects.deleteMany({
                where: { id: { in: fixture.projectIds } },
            });
        }
        if (fixture.siteIds.length) {
            await prisma.certification_application_sites.deleteMany({
                where: { id: { in: fixture.siteIds } },
            });
        }
        if (fixture.applicationIds.length) {
            await prisma.certification_applications.deleteMany({
                where: { id: { in: fixture.applicationIds } },
            });
        }
        if (fixture.customerIds.length) {
            await prisma.customers.deleteMany({
                where: { id: { in: fixture.customerIds } },
            });
        }
        if (fixture.userIds.length) {
            await prisma.users.deleteMany({
                where: { id: { in: fixture.userIds } },
            });
        }
        for (const values of Object.values(fixture)) values.length = 0;
    }

    beforeAll(async () => {
        prisma = new PrismaService(new ConfigService());
        await prisma.$connect();
        decisions = new CertificationDecisionsService(prisma);
        certificates = new CertificatesService(prisma, {} as never);
        await assertTestDatabase();
    });

    afterEach(async () => {
        await cleanup();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('executes GRANT -> MAINTAIN -> AMEND -> SUSPEND -> RESTORE -> RECERTIFY plus terminal branch', async () => {
        const run = randomUUID().replaceAll('-', '').slice(0, 12);
        const reviewerId = randomUUID();
        const customerId = randomUUID();
        const applicationId = randomUUID();
        const siteId = randomUUID();
        const projectId = randomUUID();
        fixture.userIds.push(reviewerId);
        fixture.customerIds.push(customerId);
        fixture.applicationIds.push(applicationId);
        fixture.siteIds.push(siteId);
        fixture.projectIds.push(projectId);

        await prisma.users.create({
            data: {
                id: reviewerId,
                username: `p14_reviewer_${run}`,
                email: `p14_${run}@example.test`,
                password_hash: 'phase-1.4-e2e-not-a-login-secret',
                full_name: 'Phase 1.4 Reviewer',
            },
        });
        await prisma.customers.create({
            data: {
                id: customerId,
                customer_code: `P14${run.slice(0, 8)}`,
                company_name: 'Phase 1.4 Organization V1',
                address: 'Address V1',
                email: `customer_${run}@example.test`,
            },
        });
        await prisma.certification_applications.create({
            data: {
                id: applicationId,
                customer_id: customerId,
                application_code: `APP-P14-${run}`,
                application_date: new Date('2026-01-02T00:00:00.000Z'),
                certification_type: 'initial',
                standard_name: 'ISO 9001:2015',
                certification_scope: 'Initial manufacturing scope',
                declaration_accepted: true,
                status: 'approved',
            },
        });
        await prisma.certification_application_sites.create({
            data: {
                id: siteId,
                application_id: applicationId,
                site_no: 1,
                site_name: 'Site V1',
                address: 'Site address V1',
                activities: 'Initial manufacturing',
                employee_count: 20,
                is_headquarters: true,
            },
        });
        await prisma.certification_projects.create({
            data: {
                id: projectId,
                application_id: applicationId,
                project_code: `PRJ-P14-${run}`,
                standard_name: 'ISO 9001:2015',
                status: 'active',
            },
        });

        let cycleNo = 0;
        const createCycle = async (
            auditType: string,
            reportStatus = 'technical_review_completed',
        ) => {
            cycleNo += 1;
            const planId = randomUUID();
            const reportId = randomUUID();
            const reviewId = randomUUID();
            fixture.planIds.push(planId);
            fixture.reportIds.push(reportId);
            fixture.reviewIds.push(reviewId);
            await prisma.audit_plans.create({
                data: {
                    id: planId,
                    project_id: projectId,
                    plan_code: `PLAN-P14-${run}-${cycleNo}`,
                    audit_type: auditType,
                    status: 'completed',
                    planned_start_date: new Date(`2026-0${Math.min(cycleNo, 9)}-01T00:00:00.000Z`),
                    planned_end_date: new Date(`2026-0${Math.min(cycleNo, 9)}-02T00:00:00.000Z`),
                },
            });
            await prisma.reports.create({
                data: {
                    id: reportId,
                    audit_plan_id: planId,
                    report_code: `RPT-P14-${run}-${cycleNo}`,
                    status: reportStatus,
                    audit_result: 'conformity',
                },
            });
            await prisma.technical_reviews.create({
                data: {
                    id: reviewId,
                    report_id: reportId,
                    reviewer_id: reviewerId,
                    status: 'completed',
                    completed_at: new Date('2026-08-20T00:00:00.000Z'),
                    form_data: JSON.stringify({
                        technical_review_report: {
                            recommendation: 'certification_recommended',
                            conclusion: 'All audit work and applicable NC/CAP gates completed.',
                        },
                    }),
                },
            });
            return { planId, reportId, reviewId };
        };

        const createDecision = async (input: {
            reviewId: string;
            type: 'GRANT' | 'MAINTAIN' | 'AMEND' | 'SUSPEND' | 'RESTORE' | 'WITHDRAW' | 'RECERTIFY';
            seriesId?: string;
            organization?: string;
            scope?: string;
            effective?: string;
            expiry?: string;
            reason?: string;
        }) => {
            const decision = await decisions.create({
                technical_review_id: input.reviewId,
                certificate_series_id: input.seriesId,
                decision_number: `QD-P14-${run}-${fixture.decisionIds.length + 1}`,
                decision_date: '2026-08-21',
                decision_type: input.type,
                decision_result: 'approved',
                organization_name: input.organization ?? 'Phase 1.4 Organization V1',
                organization_address: `${input.organization ?? 'Phase 1.4 Organization V1'} address`,
                management_system: 'QMS',
                standard_name: 'ISO 9001:2015',
                certification_scope: input.scope ?? 'Initial manufacturing scope',
                change_reason: input.reason,
                effective_date: input.effective,
                expiry_date: input.expiry,
                surveillance_interval_months: 12,
                signatory_name: 'Authorized Decision Maker',
                signatory_title: 'Certification Director',
            });
            fixture.decisionIds.push(decision.id);
            return decision;
        };

        const createSentNotification = async (
            reviewId: string,
            decisionId: string,
            number: number,
            result: 'certification_granted' | 'certification_maintained',
        ) => {
            await prisma.audit_result_notifications.create({
                data: {
                    technical_review_id: reviewId,
                    certification_decision_id: decisionId,
                    notification_number: `TB-P14-${run}-${number}`,
                    notification_date: new Date('2026-08-22T00:00:00.000Z'),
                    audit_type: 'certification',
                    notification_result: result,
                    has_certification_changes: result === 'certification_maintained',
                    organization_name: 'Phase 1.4 Organization',
                    standard_name: 'ISO 9001:2015',
                    certification_scope: 'Approved scope',
                    signatory_name: 'Authorized Decision Maker',
                    signatory_title: 'Certification Director',
                    status: 'sent',
                    sent_at: new Date('2026-08-22T01:00:00.000Z'),
                },
            });
        };

        const stage1PlanId = randomUUID();
        const stage1ReportId = randomUUID();
        fixture.planIds.push(stage1PlanId);
        fixture.reportIds.push(stage1ReportId);
        await prisma.audit_plans.create({
            data: {
                id: stage1PlanId,
                project_id: projectId,
                plan_code: `PLAN-P14-${run}-STAGE1`,
                audit_type: 'stage1',
                status: 'completed',
            },
        });
        await prisma.reports.create({
            data: {
                id: stage1ReportId,
                audit_plan_id: stage1PlanId,
                report_code: `RPT-P14-${run}-STAGE1`,
                status: 'stage1_completed',
            },
        });

        const initial = await createCycle('stage2');
        const grant = await createDecision({
            reviewId: initial.reviewId,
            type: 'GRANT',
            organization: 'Phase 1.4 Organization V1',
            scope: 'Initial manufacturing scope',
            effective: '2026-01-10',
            expiry: '2029-01-09',
        });
        await createSentNotification(initial.reviewId, grant.id, 1, 'certification_granted');
        const v1 = await certificates.create({
            technical_review_id: initial.reviewId,
            cert_number: `CERT-P14-${run}`,
            issue_date: '2026-01-10',
            expire_date: '2029-01-09',
        }, reviewerId);
        fixture.certificateIds.push(v1.id);
        const mainSeriesId = v1.certificate_series_id;
        fixture.seriesIds.push(mainSeriesId);
        expect(v1).toEqual(expect.objectContaining({ version_no: 1, status: 'active' }));
        expect(grant.decision_type).toBe('GRANT');

        const pdfId = randomUUID();
        fixture.documentIds.push(pdfId);
        await prisma.documentFile.create({
            data: {
                id: pdfId,
                entity_type: 'certificate',
                entity_id: v1.id,
                document_type: 'certificate_pdf',
                file_kind: 'official_pdf',
                original_name: 'certificate-v1.pdf',
                stored_name: `phase14-${run}-v1.pdf`,
                file_url: `/test/phase14-${run}-v1.pdf`,
                mime_type: 'application/pdf',
                file_size: 128,
                version_no: 1,
                is_current: true,
                uploaded_by: reviewerId,
            },
        });

        const otherCycle = await createCycle('stage2');
        const otherSeries = await prisma.certificate_series.create({
            data: {
                project_id: projectId,
                series_code: `SER-P14-OTHER-${run}`,
                status: 'active',
            },
        });
        fixture.seriesIds.push(otherSeries.id);
        const otherCertificate = await prisma.certificates.create({
            data: {
                technical_review_id: otherCycle.reviewId,
                certificate_series_id: otherSeries.id,
                version_no: 1,
                cert_number: `CERT-P14-OTHER-${run}`,
                issue_date: new Date('2026-01-10T00:00:00.000Z'),
                expire_date: new Date('2029-01-09T00:00:00.000Z'),
                status: 'active',
                organization_name: 'Other series organization',
                standard_name: 'ISO 14001:2015',
                certification_scope: 'Other series scope',
                site_snapshot_json: '[]',
            },
        });
        fixture.certificateIds.push(otherCertificate.id);

        const gs1 = await createCycle('surveillance1');
        const maintain = await createDecision({
            reviewId: gs1.reviewId,
            type: 'MAINTAIN',
            seriesId: mainSeriesId,
        });
        expect(maintain.decision_type).toBe('MAINTAIN');
        expect(await prisma.certificates.count({
            where: { certificate_series_id: mainSeriesId },
        })).toBe(1);

        await prisma.certification_applications.update({
            where: { id: applicationId },
            data: { certification_scope: 'Extended manufacturing and service scope' },
        });
        await prisma.certification_application_sites.update({
            where: { id: siteId },
            data: {
                site_name: 'Site V2',
                address: 'Site address V2',
                activities: 'Manufacturing and service',
            },
        });
        const gs2 = await createCycle('surveillance2');
        const amend = await createDecision({
            reviewId: gs2.reviewId,
            type: 'AMEND',
            seriesId: mainSeriesId,
            organization: 'Phase 1.4 Organization V2',
            scope: 'Extended manufacturing and service scope',
            effective: '2026-08-01',
            expiry: '2029-01-09',
            reason: 'Approved scope and site change in GS2.',
        });
        await createSentNotification(gs2.reviewId, amend.id, 2, 'certification_maintained');
        const v2 = await certificates.create({
            technical_review_id: gs2.reviewId,
            cert_number: `CERT-P14-${run}`,
            issue_date: '2026-08-01',
            expire_date: '2029-01-09',
            change_reason: 'Approved scope and site change in GS2.',
        }, reviewerId);
        fixture.certificateIds.push(v2.id);
        expect(v2).toEqual(expect.objectContaining({
            certificate_series_id: mainSeriesId,
            version_no: 2,
            status: 'active',
            supersedes_certificate_id: v1.id,
        }));
        expect((await prisma.certificates.findUnique({ where: { id: v1.id } }))?.status)
            .toBe('replaced');
        expect(await prisma.documentFile.count({ where: { entity_id: v1.id } }))
            .toBe(1);
        expect((await prisma.certificates.findUnique({ where: { id: otherCertificate.id } }))?.status)
            .toBe('active');

        const suspendCycle = await createCycle('surveillance2');
        await createDecision({
            reviewId: suspendCycle.reviewId,
            type: 'SUSPEND',
            seriesId: mainSeriesId,
            effective: '2026-08-10',
            reason: 'Temporary suspension condition.',
        });
        expect((await prisma.certificates.findUnique({ where: { id: v2.id } }))?.status)
            .toBe('suspended');
        expect(await prisma.certificates.count({ where: { certificate_series_id: mainSeriesId } }))
            .toBe(2);

        const restoreCycle = await createCycle('surveillance2');
        await createDecision({
            reviewId: restoreCycle.reviewId,
            type: 'RESTORE',
            seriesId: mainSeriesId,
            effective: '2026-08-15',
            reason: 'Suspension condition resolved.',
        });
        expect((await prisma.certificates.findUnique({ where: { id: v2.id } }))?.status)
            .toBe('active');

        await prisma.customers.update({
            where: { id: customerId },
            data: {
                company_name: 'Phase 1.4 Recertified Organization V3',
                address: 'Recertified address V3',
            },
        });
        await prisma.certification_applications.update({
            where: { id: applicationId },
            data: {
                certification_type: 'recertification',
                certification_scope: 'Recertified manufacturing and service scope',
            },
        });
        await prisma.certification_application_sites.update({
            where: { id: siteId },
            data: {
                site_name: 'Recertification Site V3',
                address: 'Recertification site address V3',
            },
        });
        const recertCycle = await createCycle('recertification');
        const recertify = await createDecision({
            reviewId: recertCycle.reviewId,
            type: 'RECERTIFY',
            seriesId: mainSeriesId,
            organization: 'Phase 1.4 Recertified Organization V3',
            scope: 'Recertified manufacturing and service scope',
            effective: '2029-01-10',
            expiry: '2032-01-09',
        });
        await createSentNotification(recertCycle.reviewId, recertify.id, 3, 'certification_granted');
        const v3 = await certificates.create({
            technical_review_id: recertCycle.reviewId,
            cert_number: `CERT-P14-${run}`,
            issue_date: '2029-01-10',
            expire_date: '2032-01-09',
        }, reviewerId);
        fixture.certificateIds.push(v3.id);
        expect(v3).toEqual(expect.objectContaining({
            certificate_series_id: mainSeriesId,
            version_no: 3,
            status: 'active',
            supersedes_certificate_id: v2.id,
            certification_decision_id: recertify.id,
        }));

        const mainVersions = await prisma.certificates.findMany({
            where: { certificate_series_id: mainSeriesId },
            orderBy: { version_no: 'asc' },
        });
        expect(mainVersions.map((item) => ({
            version: item.version_no,
            status: item.status,
            supersedes: item.supersedes_certificate_id,
        }))).toEqual([
            { version: 1, status: 'replaced', supersedes: null },
            { version: 2, status: 'replaced', supersedes: v1.id },
            { version: 3, status: 'active', supersedes: v2.id },
        ]);
        expect(new Set(mainVersions.map((item) => item.verification_code)).size)
            .toBe(3);
        expect(mainVersions[0].organization_name).toBe('Phase 1.4 Organization V1');
        expect(mainVersions[1].certification_scope).toBe('Extended manufacturing and service scope');
        expect(mainVersions[2].organization_name).toBe('Phase 1.4 Recertified Organization V3');
        expect(JSON.parse(mainVersions[2].site_snapshot_json ?? '[]'))
            .toEqual([
                expect.objectContaining({
                    site_name: 'Recertification Site V3',
                    address: 'Recertification site address V3',
                }),
            ]);
        expect(await prisma.documentFile.count({ where: { entity_id: v1.id } }))
            .toBe(1);

        const publicVersions = await Promise.all(
            mainVersions.map((item) =>
                certificates.findPublicCertificate(item.verification_code),
            ),
        );
        expect(publicVersions.map((item) => ({
            version: item.version_no,
            status: item.status,
            organization: item.organization_name,
            current: item.is_current_version,
        }))).toEqual([
            { version: 1, status: 'replaced', organization: 'Phase 1.4 Organization V1', current: false },
            { version: 2, status: 'replaced', organization: 'Phase 1.4 Organization V2', current: false },
            { version: 3, status: 'active', organization: 'Phase 1.4 Recertified Organization V3', current: true },
        ]);
        const statusHistory = await prisma.certificate_status_histories.findMany({
            where: { certificate_id: v2.id },
            orderBy: { created_at: 'asc' },
        });
        expect(statusHistory.map((item) => `${item.from_status}->${item.to_status}`))
            .toEqual(expect.arrayContaining([
                'active->suspended',
                'suspended->active',
                'active->replaced',
            ]));

        const otherRecertCycle = await createCycle('recertification');
        const otherRecert = await createDecision({
            reviewId: otherRecertCycle.reviewId,
            type: 'RECERTIFY',
            seriesId: otherSeries.id,
            organization: 'Other series organization V2',
            scope: 'Other series recertified scope',
            effective: '2029-01-10',
            expiry: '2032-01-09',
        });
        await createSentNotification(otherRecertCycle.reviewId, otherRecert.id, 4, 'certification_granted');
        const concurrent = await Promise.allSettled([
            certificates.create({
                technical_review_id: otherRecertCycle.reviewId,
                cert_number: `CERT-P14-OTHER-${run}`,
                issue_date: '2029-01-10',
                expire_date: '2032-01-09',
            }, reviewerId),
            certificates.create({
                technical_review_id: otherRecertCycle.reviewId,
                cert_number: `CERT-P14-OTHER-${run}`,
                issue_date: '2029-01-10',
                expire_date: '2032-01-09',
            }, reviewerId),
        ]);
        expect(concurrent.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
        const otherVersions = await prisma.certificates.findMany({
            where: { certificate_series_id: otherSeries.id },
            orderBy: { version_no: 'asc' },
        });
        for (const item of otherVersions) {
            if (!fixture.certificateIds.includes(item.id)) fixture.certificateIds.push(item.id);
        }
        expect(otherVersions.map((item) => item.version_no)).toEqual([1, 2]);
        expect(new Set(otherVersions.map((item) => item.version_no)).size).toBe(2);

        const withdrawCycle = await createCycle('surveillance2');
        await createDecision({
            reviewId: withdrawCycle.reviewId,
            type: 'WITHDRAW',
            seriesId: otherSeries.id,
            effective: '2029-02-01',
            reason: 'Terminal withdrawal branch.',
        });
        expect((await prisma.certificates.findUnique({
            where: { id: otherVersions[1].id },
        }))?.status).toBe('withdrawn');
        expect(await prisma.certificates.count({
            where: { certificate_series_id: otherSeries.id },
        })).toBe(2);

        const blockedRecertCycle = await createCycle('recertification');
        await expect(createDecision({
            reviewId: blockedRecertCycle.reviewId,
            type: 'RECERTIFY',
            seriesId: otherSeries.id,
            effective: '2032-01-10',
            expiry: '2035-01-09',
        })).rejects.toThrow('Không thể tái chứng nhận');

        console.log('Phase 1.4 isolated lifecycle: GRANT/MAINTAIN/AMEND/SUSPEND/RESTORE/RECERTIFY/WITHDRAW PASS.');
    });
});
