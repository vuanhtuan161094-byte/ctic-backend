import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import { ApplicationReviewsService } from '../src/application-reviews/application-reviews.service';
import { CertificationBodyCapabilitiesService } from '../src/certification-body-capabilities/certification-body-capabilities.service';
import { CertificationApplicationsService } from '../src/certification-applications/certification-applications.service';
import { SecurityAuditService } from '../src/security/security-audit.service';

jest.setTimeout(120_000);

function splitConnectionParts(value: string) {
    const parts: string[] = [];
    let current = '';
    let braceDepth = 0;

    for (const character of value) {
        if (character === '{') braceDepth += 1;
        if (character === '}' && braceDepth > 0) braceDepth -= 1;

        if (character === ';' && braceDepth === 0) {
            parts.push(current);
            current = '';
            continue;
        }

        current += character;
    }

    if (current) parts.push(current);
    return parts;
}

function unwrapConnectionValue(value: string) {
    const trimmed = value.trim();
    return trimmed.startsWith('{') && trimmed.endsWith('}')
        ? trimmed.slice(1, -1)
        : trimmed;
}

function parseBoolean(value: string | undefined) {
    return ['1', 'true', 'yes', 'on'].includes(
        String(value ?? '').trim().toLowerCase(),
    );
}

function buildStableTestAdapterConfig(databaseUrl: string) {
    const parts = splitConnectionParts(
        databaseUrl.replace(/^sqlserver:\/\//i, ''),
    );
    const hostPart = parts.shift()?.trim() || 'localhost:1433';
    const lastColon = hostPart.lastIndexOf(':');
    const server = lastColon > 0 ? hostPart.slice(0, lastColon) : hostPart;
    const parsedPort = lastColon > 0
        ? Number(hostPart.slice(lastColon + 1))
        : 1433;
    const parameters = new Map<string, string>();

    for (const part of parts) {
        const separator = part.indexOf('=');
        if (separator <= 0) continue;
        parameters.set(
            part.slice(0, separator).trim().toLowerCase(),
            unwrapConnectionValue(part.slice(separator + 1)),
        );
    }

    const user = parameters.get('user')
        ?? parameters.get('username')
        ?? parameters.get('uid');
    const password = parameters.get('password')
        ?? parameters.get('pwd');

    return {
        server,
        port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 1433,
        database: parameters.get('database')
            ?? parameters.get('initial catalog'),
        ...(user ? { user } : {}),
        ...(password ? { password } : {}),
        connectionTimeout: 15_000,
        requestTimeout: 60_000,
        pool: {
            max: 2,
            min: 0,
            idleTimeoutMillis: 5_000,
        },
        options: {
            encrypt: parseBoolean(parameters.get('encrypt')),
            trustServerCertificate: parseBoolean(
                parameters.get('trustservercertificate'),
            ),
            packetSize: 4_096,
            enableArithAbort: true,
        },
    };
}

const testUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';
const safe = /(?:database|initial catalog)=CTIC_Certification_P09_test(?:;|$)/i.test(testUrl);
const describeDatabase = safe ? describe : describe.skip;

if (testUrl && !safe) throw new Error('APPLICATION REVIEW E2E refused a non-test database.');

describeDatabase('Application Review + CB Capability real database E2E', () => {
    const ids = {
        preparer: randomUUID(),
        reviewer: randomUUID(),
        customer: randomUUID(),
        application: randomUUID(),
    };
    let prisma: PrismaClient;
    let reviewService: ApplicationReviewsService;
    let capabilityService: CertificationBodyCapabilitiesService;
    let applicationService: CertificationApplicationsService;
    let reviewId = '';
    let capabilityId = '';
    const createdRoleIds: string[] = [];
    const createdIndustryMappingIds: string[] = [];
    const createdNaceIafMappingIds: string[] = [];
    const createdClassificationIds: string[] = [];
    const createdIafScopeIds: string[] = [];

    async function cleanup() {
        if (!prisma) return;
        const db = await prisma.$queryRawUnsafe<Array<{ database_name: string }>>('SELECT DB_NAME() AS database_name');
        if (db[0]?.database_name !== 'CTIC_Certification_P09_test') throw new Error('Cleanup refused outside test DB.');
        await prisma.audit_logs.deleteMany({ where: { user_id: { in: [ids.preparer, ids.reviewer] } } });
        await prisma.notifications.deleteMany({ where: { user_id: { in: [ids.preparer, ids.reviewer] } } });
        if (reviewId) {
            await prisma.application_review_capability_snapshots.deleteMany({ where: { review_id: reviewId } });
            await prisma.application_review_actions.deleteMany({ where: { review_id: reviewId } });
        }
        await prisma.application_reviews.deleteMany({ where: { application_id: ids.application } });
        if (capabilityId) {
            await prisma.certification_body_capabilities.deleteMany({ where: { id: capabilityId } });
        }
        await prisma.certification_application_sites.deleteMany({ where: { application_id: ids.application } });
        await prisma.certification_applications.deleteMany({ where: { id: ids.application } });
        await prisma.customer_user_access_history.deleteMany({ where: { customer_id: ids.customer } });
        await prisma.customer_user_access.deleteMany({ where: { customer_id: ids.customer } });
        await prisma.customers.deleteMany({ where: { id: ids.customer } });
        if (createdNaceIafMappingIds.length) {
            await prisma.nace_iaf_mappings.deleteMany({ where: { id: { in: createdNaceIafMappingIds } } });
        }
        if (createdIndustryMappingIds.length) {
            await prisma.industry_code_mappings.deleteMany({ where: { id: { in: createdIndustryMappingIds } } });
        }
        if (createdIafScopeIds.length) {
            await prisma.iaf_scopes.deleteMany({ where: { id: { in: createdIafScopeIds } } });
        }
        if (createdClassificationIds.length) {
            await prisma.industry_classifications.deleteMany({ where: { id: { in: createdClassificationIds } } });
        }
        await prisma.user_roles.deleteMany({ where: { user_id: { in: [ids.preparer, ids.reviewer] } } });
        await prisma.users.deleteMany({ where: { id: { in: [ids.preparer, ids.reviewer] } } });
        if (createdRoleIds.length) {
            await prisma.roles.deleteMany({ where: { id: { in: createdRoleIds } } });
        }
    }

    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaMssql(buildStableTestAdapterConfig(testUrl)),
        });
        await prisma.$connect();
        await cleanup();
        const ensureRole = async (roleName: string) => {
            const existing = await prisma.roles.findFirst({ where: { role_name: roleName } });
            if (existing) return existing;
            const created = await prisma.roles.create({ data: { role_name: roleName, description: 'Controlled E2E role' } });
            createdRoleIds.push(created.id);
            return created;
        };
        const [coordinatorRole, reviewerRole] = await Promise.all([
            ensureRole('coordinator'),
            ensureRole('technical_reviewer'),
        ]);
        await prisma.users.createMany({ data: [
            { id: ids.preparer, username: `p09-preparer-${ids.preparer.slice(0, 8)}`, email: `${ids.preparer}@example.com`, password_hash: 'not-used', full_name: 'Example Preparer', status: 'active' },
            { id: ids.reviewer, username: `reviewer-${ids.reviewer.slice(0, 8)}`, email: `${ids.reviewer}@example.com`, password_hash: 'not-used', full_name: 'Example Reviewer', status: 'active' },
        ] });
        await prisma.user_roles.createMany({ data: [
            { user_id: ids.preparer, role_id: coordinatorRole.id },
            { user_id: ids.reviewer, role_id: reviewerRole.id },
        ] });
        await prisma.customers.create({ data: {
            id: ids.customer,
            customer_code: `E2E-${ids.customer.slice(0, 8)}`,
            company_name: 'Example Certification Customer',
            country_code: 'VN',
            address: 'Site A',
            status: 'active',
        } });
        await prisma.certification_applications.create({ data: {
            id: ids.application,
            customer_id: ids.customer,
            application_code: `APP-E2E-${ids.application.slice(0, 8)}`,
            application_date: new Date('2026-08-12'),
            standard_name: 'ISO 9001:2015',
            certification_scope: 'Manufacture of plastic products',
            declaration_accepted: true,
            status: 'draft',
        } });
        const securityAudit = new SecurityAuditService(prisma as any);
        capabilityService = new CertificationBodyCapabilitiesService(prisma as any, securityAudit);
        reviewService = new ApplicationReviewsService(prisma as any, capabilityService, securityAudit);
        applicationService = new CertificationApplicationsService(prisma as any);
    });

    afterAll(async () => {
        try {
            await cleanup();
        } finally {
            if (prisma) await prisma.$disconnect();
        }
    });

    it('completes draft, submit, return, resubmit and one-reviewer approval with durable evidence', async () => {
        let isic = await prisma.industry_classifications.findFirst({ where: { classification_type: 'ISIC', revision: 'ISIC_REV_4', code: '2220', is_active: true } });
        if (!isic) {
            isic = await prisma.industry_classifications.create({ data: {
                classification_type: 'ISIC', revision: 'ISIC_REV_4', code: '2220',
                title_en: 'Manufacture of plastics products', level: 4, is_active: true,
            } });
            createdClassificationIds.push(isic.id);
        }
        let nace = await prisma.industry_classifications.findFirst({ where: { classification_type: 'NACE', revision: 'NACE_REV_2', code: '22.2', is_active: true } });
        if (!nace) {
            nace = await prisma.industry_classifications.create({ data: {
                classification_type: 'NACE', revision: 'NACE_REV_2', code: '22.2',
                title_en: 'Manufacture of plastics products', level: 3, is_active: true,
            } });
            createdClassificationIds.push(nace.id);
        }
        let iaf = await prisma.iaf_scopes.findFirst({ where: { iaf_code: '14', is_active: true } });
        if (!iaf) {
            iaf = await prisma.iaf_scopes.create({ data: {
                iaf_code: '14', iaf_name: 'Rubber and plastic products', is_active: true,
            } });
            createdIafScopeIds.push(iaf.id);
        }
        let isicNace = await prisma.industry_code_mappings.findFirst({
            where: { source_code_id: isic.id, mapping_status: 'APPROVED', target_code: { code: '22.2' } },
            include: { target_code: true },
        });
        if (!isicNace) {
            isicNace = await prisma.industry_code_mappings.create({
                data: {
                    source_code_id: isic.id, target_code_id: nace.id, mapping_type: 'EXACT',
                    mapping_status: 'APPROVED', approved_by: ids.preparer, approved_at: new Date(),
                },
                include: { target_code: true },
            });
            createdIndustryMappingIds.push(isicNace.id);
        }
        let naceIaf = await prisma.nace_iaf_mappings.findFirst({
            where: { nace_code_id: isicNace.target_code_id, iaf_scope_id: iaf.id, management_system: 'QMS', mapping_status: 'APPROVED' },
        });
        if (!naceIaf) {
            naceIaf = await prisma.nace_iaf_mappings.create({ data: {
                nace_code_id: isicNace.target_code_id, iaf_scope_id: iaf.id,
                management_system: 'QMS', mapping_status: 'APPROVED',
                approved_by: ids.preparer, approved_at: new Date(),
                source_document: 'Controlled E2E fixture',
            } });
            createdNaceIafMappingIds.push(naceIaf.id);
        }

        const capability = await capabilityService.create({
            program_code: 'ISO_9001',
            program_name: 'ISO 9001',
            iaf_scope_id: iaf.id,
            status: 'ACTIVE',
            effective_from: '2026-01-01',
            notes: 'Controlled E2E fixture',
        }, ids.preparer);
        capabilityId = capability.id;

        const payload = {
            application_id: ids.application,
            result: 'ACCEPTED',
            reviewer_id: ids.reviewer,
            conclusion: 'Application information, classification and capability are complete',
            manday_method: 'IAF_MD5' as const,
            ems_complexity: 'HIGH' as const,
            ohsms_complexity: 'LOW' as const,
            base_mandays: 2,
            final_mandays: 2,
            stage1_mandays: 0.5,
            stage2_mandays: 1.5,
            industry_scopes: [{
                isic_code_id: isic.id,
                isic_code: isic.code,
                isic_revision: isic.revision,
                isic_title: isic.title_vi ?? isic.title_en,
                isic_nace_mapping_id: isicNace.id,
                nace_code_id: isicNace.target_code.id,
                nace_code: isicNace.target_code.code,
                nace_title: isicNace.target_code.title_vi ?? isicNace.target_code.title_en,
                nace_iaf_mapping_id: naceIaf.id,
                iaf_code: iaf.iaf_code,
                iaf_name: iaf.iaf_name,
                management_system: 'QMS' as const,
                scope_description: 'Manufacture of plastic products',
                is_primary: true,
            }],
        };
        const draft = await reviewService.create({ ...payload, submission_action: 'SAVE_DRAFT' }, ids.preparer);
        reviewId = draft.id;
        expect((await prisma.application_reviews.findUnique({ where: { id: reviewId } }))?.workflow_status).toBe('DRAFT');
        const submitted = await reviewService.create({ ...payload, submission_action: 'SUBMIT' }, ids.preparer);
        reviewId = submitted.id;
        await reviewService.review(reviewId, { action: 'RETURN', comment: 'Confirm activity' }, ids.reviewer, ['TECHNICAL_REVIEWER']);
        const resubmitted = await reviewService.create({ ...payload, submission_action: 'SUBMIT' }, ids.preparer);
        expect(resubmitted.id).toBe(reviewId);
        const liveEvaluation = await capabilityService.evaluateReview(reviewId);
        expect(liveEvaluation.overall_result).toBe('CAPABLE');
        await reviewService.review(reviewId, { action: 'APPROVE' }, ids.reviewer, ['TECHNICAL_REVIEWER']);

        const stored = await prisma.application_reviews.findUnique({
            where: { id: reviewId },
            include: { workflow_actions: true, capability_snapshots: true },
        });
        expect(stored?.workflow_status).toBe('APPROVED');
        expect(stored?.ems_complexity).toBe('HIGH');
        expect(stored?.ohsms_complexity).toBe('LOW');
        expect(stored?.workflow_actions.map((item) => item.action)).toEqual(expect.arrayContaining([
            'SAVE_DRAFT', 'SUBMIT', 'RETURN', 'RESUBMIT', 'APPROVE',
        ]));
        expect(stored?.checker_id).toBeNull();
        expect(stored?.approver_id).toBeNull();
        expect(stored?.capability_snapshots).toHaveLength(1);
        expect(stored?.capability_snapshots[0].result).toBe('CAPABLE');
        await expect(capabilityService.assertApplicationApprovedForContract(ids.application)).resolves.toBeTruthy();

        await applicationService.update(ids.application, {
            customer_id: ids.customer,
            application_code: `APP-E2E-${ids.application.slice(0, 8)}`,
            application_date: '2026-08-12',
            certification_type: 'INITIAL',
            standard_name: 'ISO 9001:2015',
            certification_scope: 'Manufacture of plastic products',
            headquarters_address: 'Site A',
            total_employee_count: 120,
            employee_count: 120,
            shift_count: 1,
            shift1_count: 120,
            external_provider_used: false,
            other_management_systems: false,
            declaration_accepted: true,
            sites: [{
                site_no: 1,
                site_name: 'Site A',
                address: 'Site A',
                activities: 'Manufacture of plastic products',
                employee_count: 120,
                is_headquarters: true,
            }],
        }, ids.preparer);

        const invalidated = await prisma.application_reviews.findUnique({
            where: { id: reviewId },
            include: { workflow_actions: true },
        });
        expect(invalidated?.workflow_status).toBe('RETURNED');
        expect(invalidated?.workflow_actions.map((item) => item.action)).toContain(
            'INVALIDATE_APPLICATION_CHANGE',
        );
        await expect(
            capabilityService.assertApplicationApprovedForContract(ids.application),
        ).rejects.toThrow();

        await reviewService.create({
            ...payload,
            effective_personnel: 120,
            submission_action: 'SUBMIT',
        }, ids.preparer);
        await reviewService.review(
            reviewId,
            { action: 'APPROVE', comment: 'Re-approved after material application change' },
            ids.reviewer,
            ['TECHNICAL_REVIEWER'],
        );
        const snapshotVersions = await prisma.application_review_capability_snapshots.findMany({
            where: { review_id: reviewId },
            orderBy: { approval_version: 'asc' },
        });
        expect(snapshotVersions.map((item) => item.approval_version)).toEqual([1, 2]);
        await expect(capabilityService.assertApplicationApprovedForContract(ids.application)).resolves.toBeTruthy();

        await capabilityService.update(capabilityId, { status: 'INACTIVE' }, ids.preparer);
        expect((await capabilityService.evaluateReview(reviewId)).overall_result).toBe('NOT_CAPABLE');
        expect((await prisma.application_review_capability_snapshots.findFirst({ where: { review_id: reviewId } }))?.result).toBe('CAPABLE');
        await expect(capabilityService.assertApplicationApprovedForContract(ids.application)).resolves.toBeTruthy();
        expect(await prisma.customer_user_access.count({ where: { customer_id: ids.customer } })).toBe(0);
        expect(await prisma.experts.count({ where: { user_id: { in: [ids.preparer, ids.reviewer] } } })).toBe(0);
    });
});
