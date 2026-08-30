import { MandayRulesService } from '../manday-calculations/manday-rules.service';
import { SurveillanceInformationService } from './surveillance-information.service';
import {
    hasSignificantSurveillanceChange,
    surveillanceNextAction,
} from './surveillance-workflow';

describe('surveillance workflow', () => {
    it('requires explicit review for a confirmed significant change', () => {
        const snapshot = {
            status: 'CONFIRMED',
            change_impact: 'CERTIFICATION_RELEVANT',
            changes: [{ category: 'CERTIFICATION_RELEVANT', affects_manday: true }],
        };

        expect(hasSignificantSurveillanceChange(snapshot)).toBe(true);
        expect(surveillanceNextAction({
            snapshot,
            eventId: 'gs1-event',
            planId: 'gs1-plan',
            appointmentExists: false,
        })).toEqual({
            code: 'REVIEW_CHANGE',
            label: 'Xem xét thay đổi',
            event_id: 'gs1-event',
            plan_id: 'gs1-plan',
        });
    });

    it('exposes appointment only after review and keeps the exact event/plan target', () => {
        expect(surveillanceNextAction({
            snapshot: {
                status: 'REVIEWED',
                change_impact: 'CERTIFICATION_RELEVANT',
                changes: [{ category: 'CERTIFICATION_RELEVANT' }],
            },
            eventId: 'gs2-event',
            planId: 'gs2-plan',
            appointmentExists: false,
        })).toEqual({
            code: 'APPOINT_TEAM',
            label: 'Chỉ định đoàn đánh giá',
            event_id: 'gs2-event',
            plan_id: 'gs2-plan',
        });
    });
});

describe('SurveillanceInformationService revision and review', () => {
    const actorId = 'actor';
    const projectId = 'project';
    const eventId = 'event';

    function fixture() {
        const tx = {
            surveillance_information_snapshots: { update: jest.fn() },
            audit_program_events: { update: jest.fn() },
        };
        const prisma = {
            surveillance_information_snapshots: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
            audit_program_events: {
                update: jest.fn(),
            },
            manday_calculations: { findFirst: jest.fn() },
            $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
        };
        const service = new SurveillanceInformationService(
            prisma as any,
            new MandayRulesService(),
        );
        jest.spyOn(service as any, 'getEvent').mockResolvedValue({
            id: eventId,
            event_type: 'surveillance1',
            planned_mandays: 4,
            planned_start_date: new Date('2027-01-01'),
            audit_programs: { project_id: projectId },
        });
        jest.spyOn(service as any, 'response').mockResolvedValue({ ok: true });
        return { prisma, service, tx };
    }

    it('keeps confirmed history immutable and creates an inherited editable revision', async () => {
        const { prisma, service } = fixture();
        prisma.surveillance_information_snapshots.findFirst.mockResolvedValue({
            id: 'snapshot-v1',
            version_no: 1,
            status: 'CONFIRMED',
            data_json: JSON.stringify({ employee_count: 100, contact_name: 'A' }),
            baseline_mandays: 4,
            effective_mandays: 4,
        });

        await service.createRevision(projectId, eventId, actorId);

        expect(prisma.surveillance_information_snapshots.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                version_no: 2,
                status: 'DRAFT',
                source_snapshot_id: 'snapshot-v1',
                source_type: 'PREVIOUS_REVISION',
                data_json: JSON.stringify({ employee_count: 100, contact_name: 'A' }),
            }),
        });
        expect(prisma.surveillance_information_snapshots.update).not.toHaveBeenCalled();
    });

    it('rejects edits to a confirmed snapshot', async () => {
        const { prisma, service } = fixture();
        prisma.surveillance_information_snapshots.findFirst.mockResolvedValue({
            id: 'snapshot-v1',
            version_no: 1,
            status: 'CONFIRMED',
        });

        await expect(service.saveDraft(projectId, eventId, {
            data: { contact_name: 'Không được ghi đè' },
        }, actorId)).rejects.toThrow(/tạo bản cập nhật mới/i);
        expect(prisma.surveillance_information_snapshots.update).not.toHaveBeenCalled();
    });

    it('confirmation freezes the snapshot without silently changing MD', async () => {
        const { prisma, service } = fixture();
        jest.spyOn(service, 'saveDraft').mockResolvedValue({ ok: true } as any);
        prisma.surveillance_information_snapshots.findFirst.mockResolvedValue({
            id: 'snapshot-v1',
            version_no: 1,
            status: 'DRAFT',
            baseline_mandays: 4,
        });

        await service.confirm(projectId, eventId, {
            data: { employee_count: 160 },
        }, actorId);

        expect(prisma.surveillance_information_snapshots.update).toHaveBeenCalledWith({
            where: { id: 'snapshot-v1' },
            data: expect.objectContaining({
                status: 'CONFIRMED',
                manday_decision: 'KEEP_CURRENT',
                effective_mandays: 4,
            }),
        });
        expect(prisma.audit_program_events.update).not.toHaveBeenCalled();
    });

    it('uses the latest confirmed effective GS1 snapshot as a GS2 baseline', async () => {
        const { prisma, service } = fixture();
        jest.spyOn(service as any, 'getInitialBaseline').mockResolvedValue({
            data: { contact_name: 'Initial' },
            surveillanceMandays: 3,
        });
        prisma.surveillance_information_snapshots.findMany.mockResolvedValue([
            {
                id: 'gs1-v2',
                status: 'REVIEWED',
                version_no: 2,
                data_json: JSON.stringify({ contact_name: 'Latest GS1' }),
                effective_mandays: 4,
                audit_event: { id: 'gs1', event_type: 'surveillance1', sequence_no: 3, program_id: 'program' },
            },
            {
                id: 'gs1-v1',
                status: 'CONFIRMED',
                version_no: 1,
                data_json: JSON.stringify({ contact_name: 'Older GS1' }),
                effective_mandays: 3.5,
                audit_event: { id: 'gs1', event_type: 'surveillance1', sequence_no: 3, program_id: 'program' },
            },
        ]);

        const baseline = await (service as any).resolveBaseline(projectId, {
            id: 'gs2',
            event_type: 'surveillance2',
            sequence_no: 4,
            program_id: 'program',
            planned_mandays: 4,
        });

        expect(baseline.sourceSnapshotId).toBe('gs1-v2');
        expect(baseline.data.contact_name).toBe('Latest GS1');
        expect(baseline.mandays).toBe(4);
    });

    it('KEEP_CURRENT completes review without changing event MD', async () => {
        const { prisma, service, tx } = fixture();
        prisma.surveillance_information_snapshots.findFirst.mockResolvedValue({
            id: 'snapshot',
            status: 'CONFIRMED',
            change_impact: 'CERTIFICATION_RELEVANT',
            changes_json: JSON.stringify([{ category: 'CERTIFICATION_RELEVANT', affects_manday: true }]),
            data_json: JSON.stringify({ employee_count: 100 }),
            baseline_mandays: 4,
        });

        await service.reviewChange(projectId, eventId, {
            decision: 'KEEP_CURRENT',
            review_note: 'Giữ MD đã duyệt',
        }, actorId);

        expect(tx.surveillance_information_snapshots.update).toHaveBeenCalledWith({
            where: { id: 'snapshot' },
            data: expect.objectContaining({
                status: 'REVIEWED',
                manday_decision: 'KEEP_CURRENT',
                effective_mandays: 4,
            }),
        });
        expect(tx.audit_program_events.update).not.toHaveBeenCalled();
    });

    it('RECALCULATED changes event MD only through the explicit review action', async () => {
        const { prisma, service, tx } = fixture();
        prisma.surveillance_information_snapshots.findFirst.mockResolvedValue({
            id: 'snapshot',
            status: 'CONFIRMED',
            change_impact: 'MANDAY_RELEVANT',
            changes_json: JSON.stringify([{ category: 'CERTIFICATION_RELEVANT', affects_manday: true }]),
            data_json: JSON.stringify({ employee_count: 160, standard_name: 'ISO 9001:2015' }),
            baseline_mandays: 4,
        });
        jest.spyOn(service as any, 'recalculateMandays').mockResolvedValue(5);

        await service.reviewChange(projectId, eventId, {
            decision: 'RECALCULATED',
            review_note: 'Tính lại do tăng nhân sự',
        }, actorId);

        expect(tx.audit_program_events.update).toHaveBeenCalledWith({
            where: { id: eventId },
            data: { planned_mandays: 5 },
        });
        expect(tx.surveillance_information_snapshots.update).toHaveBeenCalledWith({
            where: { id: 'snapshot' },
            data: expect.objectContaining({
                status: 'REVIEWED',
                manday_decision: 'RECALCULATED',
                effective_mandays: 5,
            }),
        });
    });
});
