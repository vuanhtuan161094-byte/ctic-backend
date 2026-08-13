import { BadRequestException } from '@nestjs/common';

import { AuditPlansService } from './audit-plans.service';

function submittedStage1Form(readiness: 'ready_for_stage2' | 'not_ready_for_stage2') {
    return JSON.stringify({
        stage1_report: {
            readiness_result: readiness,
        },
        workflow: {
            submitted_at: '2026-08-13T01:00:00.000Z',
            submitted_by: 'user-1',
        },
    });
}

function stage2Plan(overrides: Record<string, unknown> = {}) {
    return {
        id: 'plan-stage2',
        project_id: 'project-1',
        audit_event_id: 'event-stage2',
        audit_type: 'stage2',
        status: 'draft',
        form_data: null,
        audit_event: {
            id: 'event-stage2',
            program_id: 'program-1',
            event_type: 'stage2',
            planned_mandays: 2,
        },
        audit_team_appointment: null,
        certification_projects: {},
        reports: [],
        ...overrides,
    };
}

function stage1Plan(
    readiness: 'ready_for_stage2' | 'not_ready_for_stage2',
    overrides: Record<string, unknown> = {},
) {
    return {
        id: 'plan-stage1',
        project_id: 'project-1',
        audit_event_id: 'event-stage1',
        audit_type: 'stage1',
        status: 'completed',
        version_no: 1,
        created_at: new Date('2026-08-01T00:00:00.000Z'),
        audit_event: {
            id: 'event-stage1',
            program_id: 'program-1',
            event_type: 'stage1',
        },
        reports: [{
            id: 'report-stage1',
            version_no: 1,
            status: 'stage1_completed',
            audit_result: readiness,
            form_data: submittedStage1Form(readiness),
            updated_at: new Date('2026-08-02T00:00:00.000Z'),
        }],
        ...overrides,
    };
}

function createHarness() {
    const prisma = {
        audit_plans: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
    };

    return {
        prisma,
        service: new AuditPlansService(prisma as any),
    };
}

describe('AuditPlansService Stage 1 → Stage 2 lifecycle gate', () => {
    it('exposes READY only when Stage 1 is completed and submitted as ready for Stage 2', async () => {
        const { prisma, service } = createHarness();
        prisma.audit_plans.findUnique.mockResolvedValue(stage2Plan());
        prisma.audit_plans.findMany.mockResolvedValue([
            stage1Plan('ready_for_stage2'),
        ]);

        const result = await service.findOne('plan-stage2') as any;

        expect(result.stage2_lifecycle_gate).toEqual(expect.objectContaining({
            applicable: true,
            allowed: true,
            code: 'READY',
            stage1_plan_id: 'plan-stage1',
            stage1_report_id: 'report-stage1',
            stage1_readiness_result: 'readyforstage2',
        }));
    });

    it('blocks Stage 2 when the Stage 1 conclusion is not ready', async () => {
        const { prisma, service } = createHarness();
        prisma.audit_plans.findUnique.mockResolvedValue(stage2Plan());
        prisma.audit_plans.findMany.mockResolvedValue([
            stage1Plan('not_ready_for_stage2'),
        ]);

        await expect(
            service.start('plan-stage2', {}, 'user-1'),
        ).rejects.toMatchObject({
            response: expect.objectContaining({
                message: expect.stringContaining('chưa sẵn sàng'),
            }),
        });
    });

    it('blocks Stage 2 when Stage 1 exists but has not been completed', async () => {
        const { prisma, service } = createHarness();
        prisma.audit_plans.findUnique.mockResolvedValue(stage2Plan());
        prisma.audit_plans.findMany.mockResolvedValue([
            stage1Plan('ready_for_stage2', { status: 'in_progress' }),
        ]);

        await expect(
            service.start('plan-stage2', {}, 'user-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not apply the gate to surveillance or recertification plans', async () => {
        const { prisma, service } = createHarness();
        prisma.audit_plans.findUnique.mockResolvedValue(stage2Plan({
            id: 'plan-surveillance',
            audit_type: 'surveillance1',
            audit_event: {
                id: 'event-surveillance',
                program_id: 'program-1',
                event_type: 'surveillance1',
            },
        }));

        const result = await service.findOne('plan-surveillance') as any;

        expect(prisma.audit_plans.findMany).not.toHaveBeenCalled();
        expect(result.stage2_lifecycle_gate).toEqual(expect.objectContaining({
            applicable: false,
            allowed: true,
            code: 'NOT_APPLICABLE',
        }));
    });
});
