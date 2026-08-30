import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const scriptPath = join(
    process.cwd(),
    'scripts',
    'retire-duplicate-operational-plans-prj-2026-0006-patch36d2.cjs',
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const repair = require(scriptPath) as {
    TARGET: {
        projectCode: string;
        eventId: string;
        confirmationToken: string;
    };
    parseArguments: (arguments_: string[]) => {
        mode: 'DRY_RUN' | 'APPLY';
        project: string | null;
        event: string | null;
        confirm: string | null;
    };
    requireApplyAuthorization: (options: {
        mode: 'APPLY';
        project: string | null;
        event: string | null;
        confirm: string | null;
    }) => void;
    validateTargetArguments: (options: {
        project: string | null;
        event: string | null;
    }) => void;
    assertPreconditions: (state: unknown) => unknown;
    runSerializableRepair: <T>(
        prisma: {
            $transaction: (
                work: (transaction: unknown) => Promise<T>,
                options: { isolationLevel: string },
            ) => Promise<T>;
        },
        work: (transaction: unknown) => Promise<T>,
    ) => Promise<T>;
};

describe('retire-only duplicate operational PLAN repair script', () => {
    const source = readFileSync(scriptPath, 'utf8');
    const applySource = source.slice(
        source.indexOf('async function executeApply'),
        source.indexOf('function createPrismaClient'),
    );
    const exactTarget = {
        mode: 'APPLY' as const,
        project: repair.TARGET.projectCode,
        event: repair.TARGET.eventId,
        confirm: repair.TARGET.confirmationToken,
    };

    it('defaults to DRY_RUN', () => {
        expect(repair.parseArguments([])).toEqual({
            mode: 'DRY_RUN',
            project: null,
            event: null,
            confirm: null,
        });
    });

    it('requires the exact apply confirmation token', () => {
        expect(() => repair.requireApplyAuthorization({
            ...exactTarget,
            confirm: null,
        })).toThrow(/confirmation token/i);
        expect(() => repair.requireApplyAuthorization(exactTarget)).not.toThrow();
    });

    it('rejects any project or event outside the approved target', () => {
        expect(() => repair.validateTargetArguments({
            project: 'PRJ-2026-9999',
            event: repair.TARGET.eventId,
        })).toThrow(/project guard rejected/i);
        expect(() => repair.validateTargetArguments({
            project: repair.TARGET.projectCode,
            event: '00000000-0000-0000-0000-000000000000',
        })).toThrow(/event guard rejected/i);
    });

    it('checks all preconditions before the first update', () => {
        expect(() => repair.assertPreconditions({
            project: null,
            event: null,
            plans: [],
            files: [],
            auditLogs: [],
        })).toThrow(/preconditions do not match/i);
        expect(applySource.indexOf('assertPreconditions(before)')).toBeGreaterThan(-1);
        expect(applySource.indexOf('audit_plans.updateMany')).toBeGreaterThan(
            applySource.indexOf('assertPreconditions(before)'),
        );
    });

    it('contains no transfer, canonical update, or DELETE operation', () => {
        expect(source).not.toMatch(/\.(?:delete|deleteMany)\s*\(/);
        expect(applySource).not.toMatch(/form_data\s*:/);
        expect(applySource).not.toContain('TARGET.canonical.id }, data:');
        expect(applySource).not.toMatch(/MERGE|TRANSFER_STRUCTURED|reassign/i);
        expect(applySource).toContain("data: { status: 'cancelled' }");
    });

    it('always requests a SERIALIZABLE transaction', async () => {
        const transaction = {};
        const prisma = {
            $transaction: jest.fn(async (
                work: (value: unknown) => Promise<string>,
                options: { isolationLevel: string },
            ) => {
                expect(options).toEqual({ isolationLevel: 'Serializable' });
                return work(transaction);
            }),
        };
        await expect(repair.runSerializableRepair(
            prisma,
            async (value) => {
                expect(value).toBe(transaction);
                return 'committed';
            },
        )).resolves.toBe('committed');
    });

    it('rolls back when any in-transaction validation throws', async () => {
        let status = 'draft';
        const prisma = {
            $transaction: jest.fn(async (
                work: (transaction: { retire: () => void }) => Promise<unknown>,
            ) => {
                const before = status;
                try {
                    return await work({ retire: () => { status = 'cancelled'; } });
                } catch (error) {
                    status = before;
                    throw error;
                }
            }),
        };
        await expect(repair.runSerializableRepair(
            prisma,
            async (transaction: unknown) => {
                (transaction as { retire: () => void }).retire();
                throw new Error('validation mismatch');
            },
        )).rejects.toThrow(/validation mismatch/i);
        expect(status).toBe('draft');
    });

    it('validates retirement and audit history before transaction completion', () => {
        const appliedIndex = applySource.indexOf('validateAppliedState(');
        const auditCreateIndex = applySource.indexOf('transaction.audit_logs.create');
        const auditValidationIndex = applySource.indexOf('validateAuditState(');
        expect(appliedIndex).toBeGreaterThan(-1);
        expect(auditCreateIndex).toBeGreaterThan(appliedIndex);
        expect(auditValidationIndex).toBeGreaterThan(auditCreateIndex);
        expect(source).toContain('Existing audit history preservation');
        expect(source).toContain('Historical PLAN-2027-0004 F.05 attachment');
        expect(source).toContain('Canonical resolver result');
    });
});
