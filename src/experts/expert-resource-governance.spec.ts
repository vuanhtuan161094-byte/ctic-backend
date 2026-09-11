import { ExpertResourceGovernanceService } from './expert-resource-governance.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

function createPrismaMock() {
    return {
        expert_availability_periods: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        expert_customer_conflicts: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        audit_team_members: {
            findMany: jest.fn().mockResolvedValue([]),
        },
    };
}

describe('ExpertResourceGovernanceService', () => {
    it('hard-blocks inclusive LEAVE overlap at a boundary date', async () => {
        const prisma = createPrismaMock();
        prisma.expert_availability_periods.findMany.mockResolvedValue([{
            id: 'availability-1',
            expert_id: 'expert-1',
            availability_type: 'LEAVE',
            status: 'ACTIVE',
            start_datetime: new Date('2026-09-01T00:00:00.000Z'),
            end_datetime: new Date('2026-09-03T23:59:59.999Z'),
        }]);
        const service = new ExpertResourceGovernanceService(
            prisma as unknown as PrismaService,
        );

        const result = await service.evaluate(
            'expert-1',
            '2026-09-03',
            '2026-09-03',
        );

        expect(result.eligible).toBe(false);
        expect(result.reasons).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'LEAVE', severity: 'BLOCK' }),
        ]));
        expect(prisma.expert_availability_periods.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    start_datetime: expect.objectContaining({ lte: expect.any(Date) }),
                    end_datetime: expect.objectContaining({ gte: expect.any(Date) }),
                }),
            }),
        );
    });

    it('keeps a non-overlapping period eligible', async () => {
        const prisma = createPrismaMock();
        const service = new ExpertResourceGovernanceService(
            prisma as unknown as PrismaService,
        );

        const result = await service.evaluate(
            'expert-1',
            '2026-10-10',
            '2026-10-11',
        );

        expect(result.eligible).toBe(true);
        expect(result.reasons).toEqual([]);
    });

    it('blocks only the requested customer when an open-ended decision is PROHIBITED', async () => {
        const prisma = createPrismaMock();
        prisma.expert_customer_conflicts.findMany.mockImplementation(
            async ({ where }: { where: { customer_id: string } }) =>
                where.customer_id === 'customer-a'
                    ? [{
                        id: 'conflict-1',
                        expert_id: 'expert-1',
                        customer_id: 'customer-a',
                        independence_status: 'PROHIBITED',
                        declaration_status: 'ACTIVE',
                        valid_from: new Date('2026-01-01T00:00:00.000Z'),
                        valid_to: null,
                    }]
                    : [],
        );
        const service = new ExpertResourceGovernanceService(
            prisma as unknown as PrismaService,
        );

        const customerA = await service.evaluate(
            'expert-1',
            '2026-12-01',
            '2026-12-01',
            { customerId: 'customer-a' },
        );
        const customerB = await service.evaluate(
            'expert-1',
            '2026-12-01',
            '2026-12-01',
            { customerId: 'customer-b' },
        );

        expect(customerA.eligible).toBe(false);
        expect(customerA.reasons[0].code).toBe('INDEPENDENCE_CONFLICT');
        expect(customerB.eligible).toBe(true);
    });

    it('hard-blocks an overlapping OTHER_COMMITMENT without inventing a capacity threshold', async () => {
        const prisma = createPrismaMock();
        prisma.expert_availability_periods.findMany.mockResolvedValue([{
            id: 'commitment-1',
            expert_id: 'expert-1',
            availability_type: 'OTHER_COMMITMENT',
            status: 'ACTIVE',
            start_datetime: new Date('2026-09-02T00:00:00.000Z'),
            end_datetime: new Date('2026-09-03T23:59:59.999Z'),
        }]);
        prisma.audit_team_members.findMany.mockResolvedValue([{
            id: 'member-1',
            appointment_id: 'appointment-1',
            planned_start_date: new Date('2026-09-01T00:00:00.000Z'),
            planned_end_date: new Date('2026-09-01T00:00:00.000Z'),
            planned_mandays: 1,
            audit_team_appointments: {
                audit_plans: {
                    id: 'plan-1',
                    plan_code: 'PLAN-1',
                    audit_type: 'stage1',
                    project_id: 'project-1',
                    audit_event: { event_type: 'STAGE1' },
                },
            },
        }]);
        const service = new ExpertResourceGovernanceService(
            prisma as unknown as PrismaService,
        );

        const result = await service.evaluate(
            'expert-1',
            '2026-09-01',
            '2026-09-03',
        );

        expect(result.eligible).toBe(false);
        expect(result.workload.assigned_mandays).toBe(1);
        expect(result.workload.other_commitment_days).toBe(2);
        expect(result.workload.capacity_threshold_mandays).toBeNull();
        expect(result.workload.capacity_exceeded).toBe(false);
        expect(result.reasons.map((reason) => reason.code)).toEqual(
            expect.arrayContaining(['OTHER_COMMITMENT', 'REMOTE_WORKLOAD']),
        );
        expect(result.reasons).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'OTHER_COMMITMENT', severity: 'BLOCK' }),
            expect.objectContaining({ code: 'REMOTE_WORKLOAD', severity: 'WARNING' }),
        ]));
    });

    it('keeps Stage 1 remote overlap as workload warning, not DATE_CONFLICT', async () => {
        const prisma = createPrismaMock();
        prisma.audit_team_members.findMany.mockResolvedValue([{
            id: 'member-stage1',
            appointment_id: 'appointment-stage1',
            planned_start_date: new Date('2026-09-03T00:00:00.000Z'),
            planned_end_date: new Date('2026-09-03T00:00:00.000Z'),
            planned_mandays: 1,
            audit_team_appointments: {
                audit_plans: {
                    id: 'plan-stage1',
                    plan_code: 'PLAN-STAGE1',
                    audit_type: 'stage1',
                    project_id: 'project-1',
                    audit_event: { event_type: 'STAGE1' },
                },
            },
        }]);
        const service = new ExpertResourceGovernanceService(
            prisma as unknown as PrismaService,
        );

        const result = await service.evaluate(
            'expert-1',
            '2026-09-03',
            '2026-09-03',
        );

        expect(result.eligible).toBe(true);
        expect(result.reasons).toEqual([
            expect.objectContaining({ code: 'REMOTE_WORKLOAD', severity: 'WARNING' }),
        ]);
    });

    it('keeps an onsite assignment overlap as DATE_CONFLICT hard block', async () => {
        const prisma = createPrismaMock();
        prisma.audit_team_members.findMany.mockResolvedValue([{
            id: 'member-onsite',
            appointment_id: 'appointment-onsite',
            planned_start_date: new Date('2026-09-03T00:00:00.000Z'),
            planned_end_date: new Date('2026-09-03T00:00:00.000Z'),
            planned_mandays: 1,
            audit_team_appointments: {
                audit_plans: {
                    id: 'plan-onsite',
                    plan_code: 'PLAN-ONSITE',
                    audit_type: 'surveillance',
                    project_id: 'project-1',
                    audit_event: { event_type: 'SURVEILLANCE' },
                },
            },
        }]);
        const service = new ExpertResourceGovernanceService(
            prisma as unknown as PrismaService,
        );

        const result = await service.evaluate(
            'expert-1',
            '2026-09-03',
            '2026-09-03',
        );

        expect(result.eligible).toBe(false);
        expect(result.reasons).toEqual([
            expect.objectContaining({ code: 'DATE_CONFLICT', severity: 'BLOCK' }),
        ]);
    });

    it('skips assignment reads when assignment details are explicitly excluded', async () => {
        const prisma = createPrismaMock();
        const service = new ExpertResourceGovernanceService(
            prisma as unknown as PrismaService,
        );

        const result = await service.evaluate(
            'expert-1',
            '2026-09-03',
            '2026-09-03',
            { includeAssignments: false },
        );

        expect(prisma.audit_team_members.findMany).not.toHaveBeenCalled();
        expect(result.assignments).toEqual([]);
        expect(result.workload.assigned_mandays).toBe(0);
        expect(result.workload.engagement_count).toBe(0);
    });

    it('retries the complete cancellation transaction only for transient ENOTBEGUN', async () => {
        const existing = {
            id: 'availability-1',
            expert_id: 'expert-1',
            status: 'ACTIVE',
        };
        const updated = { ...existing, status: 'CANCELLED' };
        const tx = {
            expert_availability_periods: { update: jest.fn().mockResolvedValue(updated) },
            expert_resource_actions: { create: jest.fn().mockResolvedValue({}) },
            audit_logs: { create: jest.fn().mockResolvedValue({}) },
        };
        const transient = Object.assign(
            new Error('Transaction has not begun. Call begin() first.'),
            { code: 'ENOTBEGUN' },
        );
        const firstTx = {
            expert_availability_periods: { update: jest.fn().mockResolvedValue(updated) },
            expert_resource_actions: { create: jest.fn().mockRejectedValue(transient) },
            audit_logs: { create: jest.fn().mockResolvedValue({}) },
        };
        const prisma = {
            expert_availability_periods: { findFirst: jest.fn().mockResolvedValue(existing) },
            $transaction: jest.fn()
                .mockImplementationOnce(async (callback: (client: typeof firstTx) => Promise<unknown>) => callback(firstTx))
                .mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
        };
        const service = new ExpertResourceGovernanceService(prisma as unknown as PrismaService);

        await expect(service.cancelAvailability(
            'expert-1',
            'availability-1',
            { reason: 'Cancelled for retry test' },
            'admin-1',
        )).resolves.toEqual(updated);

        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
        expect(firstTx.expert_availability_periods.update).toHaveBeenCalledTimes(1);
        expect(firstTx.expert_resource_actions.create).toHaveBeenCalledTimes(1);
        expect(firstTx.audit_logs.create).not.toHaveBeenCalled();
        expect(tx.expert_availability_periods.update).toHaveBeenCalledTimes(1);
        expect(tx.expert_resource_actions.create).toHaveBeenCalledTimes(1);
        expect(tx.audit_logs.create).toHaveBeenCalledTimes(1);
    });

    it('stops after two total attempts when ENOTBEGUN persists', async () => {
        const transient = Object.assign(new Error('Transaction has not begun.'), { code: 'ENOTBEGUN' });
        const prisma = { $transaction: jest.fn().mockRejectedValue(transient) };
        const service = new ExpertResourceGovernanceService(prisma as unknown as PrismaService);

        await expect((service as any).retryTransaction(jest.fn())).rejects.toBe(transient);

        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('does not retry localhost connection or business errors', async () => {
        const prisma = { $transaction: jest.fn() };
        const service = new ExpertResourceGovernanceService(prisma as unknown as PrismaService);
        const errors = [
            Object.assign(new Error("Can't reach database server at localhost:1433"), { code: 'P1001' }),
            Object.assign(new Error('A commit cannot be executed on an expired transaction.'), { code: 'P2028' }),
            new ConflictException('Không đáp ứng quy tắc độc lập'),
        ];

        for (const error of errors) {
            prisma.$transaction.mockReset().mockRejectedValue(error);
            await expect((service as any).retryTransaction(jest.fn())).rejects.toBe(error);
            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        }
    });
});
