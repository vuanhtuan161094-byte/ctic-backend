import { Prisma } from '@prisma/client';

import { AuditPlansService } from './audit-plans.service';

describe('AuditPlansService operational plan idempotency', () => {
    it('serializes three creates for one event into exactly one plan row', async () => {
        const rows: any[] = [];
        const transaction = {
            certification_projects: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'project-1',
                    standard_name: 'ISO 9001:2015',
                    certification_applications: {
                        standard_name: 'ISO 9001:2015',
                        certification_scope: 'Scope',
                        customers: {
                            company_name: 'Customer',
                            address: 'Address',
                        },
                    },
                }),
            },
            audit_program_events: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'event-gs1',
                    event_type: 'surveillance1',
                    planned_start_date: new Date('2027-10-26T00:00:00Z'),
                    planned_end_date: new Date('2027-10-30T00:00:00Z'),
                    audit_programs: {
                        project_id: 'project-1',
                        program_year: 2027,
                        organization_name: 'Customer',
                        address: 'Address',
                        certification_scope: 'Scope',
                        standard_name: 'ISO 9001:2015',
                    },
                }),
            },
            audit_plans: {
                findMany: jest.fn().mockImplementation(async () => [...rows]),
                findFirst: jest.fn().mockImplementation(async (args: any) => (
                    args?.select?.version_no
                        ? null
                        : null
                )),
                create: jest.fn().mockImplementation(async (args: any) => {
                    const created = {
                        id: 'plan-canonical',
                        ...args.data,
                        created_at: new Date('2026-08-14T00:00:00Z'),
                        updated_at: new Date('2026-08-14T00:00:00Z'),
                        certification_projects: {},
                        audit_event: {},
                        reports: [],
                        audit_team_appointment: null,
                    };
                    rows.push(created);
                    return created;
                }),
            },
            $queryRaw: jest.fn().mockResolvedValue([
                { id: 'event-gs1' },
            ]),
        };

        let serializationQueue = Promise.resolve();
        const prisma = {
            $transaction: jest.fn((callback: (client: any) => Promise<any>) => {
                const run = serializationQueue.then(() => callback(transaction));
                serializationQueue = run.then(() => undefined, () => undefined);
                return run;
            }),
        };
        const service = new AuditPlansService(prisma as any);
        const dto = {
            project_id: 'project-1',
            audit_event_id: 'event-gs1',
            status: 'draft',
        };

        const results = await Promise.all([
            service.create(dto),
            service.create(dto),
            service.create(dto),
        ]);

        expect(transaction.audit_plans.create).toHaveBeenCalledTimes(1);
        expect(rows).toHaveLength(1);
        expect(results.map((item: any) => item.id)).toEqual([
            'plan-canonical',
            'plan-canonical',
            'plan-canonical',
        ]);
        expect(prisma.$transaction).toHaveBeenCalledTimes(3);
        for (const call of prisma.$transaction.mock.calls) {
            expect(call[1]).toEqual({
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            });
        }
    });
});
