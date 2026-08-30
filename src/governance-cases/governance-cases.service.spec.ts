import {
    ConflictException,
    ForbiddenException,
} from '@nestjs/common';

import { GovernanceCasesService } from './governance-cases.service';

describe('GovernanceCasesService', () => {
    const actors = {
        coordinator: { userId: '00000000-0000-4000-8000-000000000001', roles: ['COORDINATOR'] },
        investigator: { userId: '00000000-0000-4000-8000-000000000002', roles: ['AUDITOR'] },
        reviewer: { userId: '00000000-0000-4000-8000-000000000003', roles: ['TECHNICAL_REVIEWER'] },
        decision: { userId: '00000000-0000-4000-8000-000000000004', roles: ['DECISION_MAKER'] },
        originalMaker: { userId: '00000000-0000-4000-8000-000000000005', roles: ['DECISION_MAKER'] },
        customer: { userId: '00000000-0000-4000-8000-000000000006', roles: ['CUSTOMER'] },
    };

    let prisma: any;
    let workItems: any;
    let numbering: any;
    let service: GovernanceCasesService;

    beforeEach(() => {
        prisma = {
            $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
            audit_logs: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            customer_user_access: { findMany: jest.fn(), findFirst: jest.fn() },
            customer_organization_change_requests: { findUnique: jest.fn() },
            certification_projects: { findUnique: jest.fn() },
            certificate_series: { findUnique: jest.fn() },
            certification_decisions: { findUnique: jest.fn(), update: jest.fn() },
            controlled_documents: { findUnique: jest.fn() },
            certification_change_cases: {
                create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(),
            },
            special_audit_cases: {
                create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(),
            },
            complaint_cases: {
                create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn(),
            },
            appeal_cases: {
                create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn(),
            },
            audit_plans: { findUnique: jest.fn() },
            documentFile: { findMany: jest.fn().mockResolvedValue([]) },
        };
        workItems = {
            openWorkItem: jest.fn().mockResolvedValue({ id: 'work-1' }),
            completeWorkItem: jest.fn().mockResolvedValue({ id: 'work-1', status: 'DONE' }),
        };
        numbering = {
            allocateControlledNumber: jest.fn()
                .mockResolvedValueOnce('CHG-2026-0001')
                .mockResolvedValueOnce('SA-2026-0001')
                .mockResolvedValueOnce('CMP-2026-0001')
                .mockResolvedValueOnce('APL-2026-0001'),
        };
        service = new GovernanceCasesService(prisma, workItems, numbering);
    });

    it('promotes an organization change into impact assessment without mutating customer or certificate state', async () => {
        prisma.customer_organization_change_requests.findUnique.mockResolvedValue({
            id: '10000000-0000-4000-8000-000000000001',
            customer_id: '20000000-0000-4000-8000-000000000001',
            before_snapshot: JSON.stringify({ address: 'Old' }),
            after_snapshot: JSON.stringify({ address: 'New' }),
        });
        prisma.certification_change_cases.create.mockImplementation(({ data }: any) => ({
            id: '30000000-0000-4000-8000-000000000001',
            ...data,
        }));

        const created = await service.createChangeCase({
            source_request_id: '10000000-0000-4000-8000-000000000001',
            customer_id: '20000000-0000-4000-8000-000000000001',
            change_type: 'ADDRESS',
            description: 'Registered address changed',
        }, actors.coordinator);

        expect(created.source).toBe('CUSTOMER_ORGANIZATION_CHANGE');
        expect(created.before_snapshot).toContain('Old');
        expect(prisma.certification_decisions.update).not.toHaveBeenCalled();
        expect(workItems.openWorkItem).toHaveBeenCalledWith(expect.objectContaining({
            sourceKey: `change:${created.id}:impact`,
            workType: 'CHANGE_IMPACT_REVIEW',
        }));
    });

    it('creates a linked special-audit case from impact assessment without changing certificate state', async () => {
        prisma.certification_change_cases.findUnique.mockResolvedValue({
            id: 'change-1', case_number: 'CHG-2026-0001', customer_id: 'customer-1', project_id: null,
            certificate_series_id: null, owner_id: actors.coordinator.userId, submitted_by: actors.coordinator.userId,
            description: 'Significant process change', status: 'SUBMITTED', assessment_outcome: null,
        });
        prisma.certification_change_cases.update.mockImplementation(({ data }: any) => ({ id: 'change-1', ...data }));
        prisma.special_audit_cases.create.mockImplementation(({ data }: any) => ({ id: 'special-1', ...data }));

        const result = await service.assessChangeCase('change-1', {
            outcome: 'SPECIAL_AUDIT_REQUIRED',
            scope_change: false,
            site_population_change: true,
            manday_recalculation_required: true,
            competency_change_required: true,
            special_audit_required: true,
            suspension_consideration_required: false,
            commercial_update_required: false,
            document_update_required: true,
            rationale: 'Verification required',
            special_audit_scope: 'Changed production site',
        }, actors.coordinator);

        expect(result.special_audit).toEqual(expect.objectContaining({
            trigger_entity_type: 'certification_change_case',
            trigger_entity_id: 'change-1',
        }));
        expect(prisma.certification_decisions.update).not.toHaveBeenCalled();
        expect(workItems.openWorkItem).toHaveBeenCalledWith(expect.objectContaining({
            sourceKey: 'special-audit:special-1:plan',
        }));
    });

    it('blocks cross-customer complaint submission at the service boundary', async () => {
        prisma.customer_user_access.findMany.mockResolvedValue([{ customer_id: 'customer-a' }]);
        await expect(service.createComplaint({
            customer_id: 'customer-b',
            received_date: '2026-08-24',
            complainant_name: 'Customer B',
            subject: 'Cross customer attempt',
            description: 'Must be denied before persistence',
        }, actors.customer, true)).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.complaint_cases.create).not.toHaveBeenCalled();
    });

    it('returns a customer-safe complaint projection without investigation or SoD fields', async () => {
        prisma.customer_user_access.findMany.mockResolvedValue([{ customer_id: 'customer-a' }]);
        prisma.complaint_cases.findMany.mockResolvedValue([{
            id: 'complaint-1', complaint_number: 'CMP-2026-0001', customer_id: 'customer-a',
            status: 'INVESTIGATING', subject: 'Delivery', description: 'Dissatisfaction',
            source_channel: 'CUSTOMER_PORTAL', complainant_name: 'Portal User',
            internal_notes: 'PRIVATE', investigation: 'PRIVATE', independence_note: 'PRIVATE',
            investigator_id: actors.investigator.userId, decision_owner_id: actors.decision.userId,
            acknowledgement_due: null, response_due: null, created_at: new Date(),
        }]);
        const [projection] = await service.portalComplaints(actors.customer);
        expect(projection).not.toHaveProperty('internal_notes');
        expect(projection).not.toHaveProperty('investigation');
        expect(projection).not.toHaveProperty('independence_note');
        expect(projection).not.toHaveProperty('investigator_id');
        expect(projection).not.toHaveProperty('decision_owner_id');
    });

    it('prevents one person from investigating and deciding the same complaint', async () => {
        prisma.complaint_cases.findUnique.mockResolvedValue({
            id: 'complaint-1', status: 'RECEIVED', involved_user_ids_json: null,
        });
        await expect(service.assignComplaint('complaint-1', {
            owner_id: actors.coordinator.userId,
            investigator_id: actors.investigator.userId,
            decision_owner_id: actors.investigator.userId,
            independence_note: 'Same person is not independent',
        }, actors.coordinator)).rejects.toBeInstanceOf(ConflictException);
    });

    it('keeps closed complaint records immutable', async () => {
        prisma.complaint_cases.findUnique.mockResolvedValue({
            id: 'complaint-1', status: 'CLOSED', investigator_id: actors.investigator.userId,
        });
        await expect(service.investigateComplaint('complaint-1', {
            investigation: 'Attempted overwrite',
        }, actors.investigator)).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.complaint_cases.update).not.toHaveBeenCalled();
    });

    it('requires acknowledgement before the assigned investigator can submit findings', async () => {
        prisma.complaint_cases.findUnique.mockResolvedValue({
            id: 'complaint-1', status: 'INVESTIGATING', investigator_id: actors.investigator.userId,
            independence_checked_at: new Date(), acknowledgement_date: null,
        });
        await expect(service.investigateComplaint('complaint-1', {
            investigation: 'Findings draft',
        }, actors.investigator)).rejects.toBeInstanceOf(ConflictException);
    });

    it('prevents original certification decision maker from appeal review or decision assignment', async () => {
        prisma.appeal_cases.findUnique.mockResolvedValue({
            id: 'appeal-1', status: 'SUBMITTED',
            challenged_decision: { created_by: actors.originalMaker.userId },
        });
        await expect(service.assignAppeal('appeal-1', {
            owner_id: actors.coordinator.userId,
            reviewer_id: actors.reviewer.userId,
            decision_owner_id: actors.originalMaker.userId,
            independence_note: 'Would be self-review',
        }, actors.coordinator)).rejects.toBeInstanceOf(ConflictException);
    });

    it('records a successful appeal as a subsequent-action work item without overwriting the challenged decision', async () => {
        prisma.appeal_cases.findUnique.mockResolvedValue({
            id: 'appeal-1', appeal_number: 'APL-2026-0001', project_id: 'project-1',
            status: 'DECISION_PENDING', reviewer_id: actors.reviewer.userId,
            decision_owner_id: actors.decision.userId, independence_checked_at: new Date(),
            challenged_decision_id: 'decision-original',
            challenged_decision: { created_by: actors.originalMaker.userId },
        });
        prisma.appeal_cases.update.mockImplementation(({ data }: any) => ({ id: 'appeal-1', ...data }));

        await service.decideAppeal('appeal-1', {
            outcome: 'UPHELD',
            required_action: 'AMEND',
            final_response: 'Appeal upheld; a new controlled decision is required.',
        }, actors.decision);

        expect(prisma.certification_decisions.update).not.toHaveBeenCalled();
        expect(workItems.openWorkItem).toHaveBeenCalledWith(expect.objectContaining({
            sourceKey: 'appeal:appeal-1:subsequent-action',
            context: expect.objectContaining({ challenged_decision_id: 'decision-original', required_action: 'AMEND' }),
        }));
    });

    it('returns appeal customer projection without review notes or internal deliberation', async () => {
        prisma.customer_user_access.findMany.mockResolvedValue([{ customer_id: 'customer-a' }]);
        prisma.appeal_cases.findMany.mockResolvedValue([{
            id: 'appeal-1', appeal_number: 'APL-2026-0001', customer_id: 'customer-a', project_id: 'project-1',
            status: 'UNDER_REVIEW', grounds: 'Formal grounds', appellant_name: 'Customer',
            review_notes: 'PRIVATE', internal_deliberation: 'PRIVATE', independence_note: 'PRIVATE',
            acknowledgement_due: null, response_due: null, created_at: new Date(),
            challenged_decision: { id: 'decision-1', decision_number: 'DEC-1', decision_type: 'REFUSE' },
        }]);
        const [projection] = await service.portalAppeals(actors.customer);
        expect(projection).not.toHaveProperty('review_notes');
        expect(projection).not.toHaveProperty('internal_deliberation');
        expect(projection).not.toHaveProperty('independence_note');
        expect(projection.challenged_decision.id).toBe('decision-1');
    });

    it('does not allow a special-audit result to mutate certificate state directly', async () => {
        prisma.special_audit_cases.findUnique.mockResolvedValue({
            id: 'special-1', case_number: 'SA-2026-0001', project_id: 'project-1', status: 'PLANNED',
            audit_plan_id: 'plan-1', owner_id: actors.coordinator.userId, created_by: actors.coordinator.userId,
            result: null,
        });
        prisma.special_audit_cases.update.mockImplementation(({ data }: any) => ({ id: 'special-1', ...data }));
        await service.recordSpecialAuditResult('special-1', {
            result: 'Scope evidence supports amendment review',
            follow_up_action: 'AMEND',
        }, actors.coordinator);
        expect(prisma.certification_decisions.update).not.toHaveBeenCalled();
        expect(workItems.openWorkItem).toHaveBeenCalledWith(expect.objectContaining({
            workType: 'SPECIAL_AUDIT_FOLLOW_UP',
            assignedRole: 'DECISION_MAKER',
        }));
    });
});
