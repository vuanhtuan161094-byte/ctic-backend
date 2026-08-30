import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const scriptPath = join(
  process.cwd(),
  'scripts',
  'repair-duplicate-operational-plans-prj-2026-0006-patch36d1.cjs',
);

// The repair script is CommonJS so it can run directly with the repository's
// pinned Node runtime without compiling production source first.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repair = require(scriptPath) as {
  TARGET: {
    projectCode: string;
    eventId: string;
    confirmationToken: string;
  };
  RepairAbortError: new (
    reason: string,
    details?: string[],
    writesCommitted?: boolean,
  ) => Error & { writesCommitted: boolean };
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
  validateAppliedState: (
    state: unknown,
    dependencies: Record<string, string[]>,
  ) => unknown;
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

describe('targeted duplicate operational PLAN repair script', () => {
  const source = readFileSync(scriptPath, 'utf8');
  const exactTarget = {
    mode: 'APPLY' as const,
    project: repair.TARGET.projectCode,
    event: repair.TARGET.eventId,
    confirm: repair.TARGET.confirmationToken,
  };

  it('defaults to DRY_RUN and performs no implicit apply', () => {
    expect(repair.parseArguments([])).toEqual({
      mode: 'DRY_RUN',
      project: null,
      event: null,
      confirm: null,
    });
  });

  it('requires the explicit APPLY confirmation token', () => {
    expect(() =>
      repair.requireApplyAuthorization({
        ...exactTarget,
        confirm: null,
      }),
    ).toThrow(/confirmation token/i);
    expect(() => repair.requireApplyAuthorization(exactTarget)).not.toThrow();
  });

  it('rejects any project or event outside the exact approved target', () => {
    expect(() =>
      repair.validateTargetArguments({
        project: 'PRJ-2026-9999',
        event: repair.TARGET.eventId,
      }),
    ).toThrow(/project guard rejected/i);
    expect(() =>
      repair.validateTargetArguments({
        project: repair.TARGET.projectCode,
        event: '00000000-0000-0000-0000-000000000000',
      }),
    ).toThrow(/event guard rejected/i);
  });

  it('aborts a DEV precondition mismatch before repair work', () => {
    expect(() =>
      repair.assertPreconditions({
        project: null,
        event: null,
        plans: [],
        files: [],
      }),
    ).toThrow(/preconditions do not match/i);

    const preconditionIndex = source.indexOf('assertPreconditions(before)');
    const firstUpdateIndex = source.indexOf('transaction.audit_plans.update');
    expect(preconditionIndex).toBeGreaterThan(-1);
    expect(firstUpdateIndex).toBeGreaterThan(preconditionIndex);
  });

  it('contains no destructive Prisma DELETE operation', () => {
    expect(source).not.toMatch(/\.(?:delete|deleteMany)\s*\(/);
    expect(source).toContain("status: 'cancelled'");
    expect(source).toContain('reassign: false');
  });

  it('always requests a SERIALIZABLE transaction', async () => {
    const transaction = {};
    const prisma = {
      $transaction: jest.fn(
        async (
          work: (value: unknown) => Promise<string>,
          options: { isolationLevel: string },
        ) => {
          expect(options).toEqual({
            isolationLevel: 'Serializable',
          });
          return work(transaction);
        },
      ),
    };

    await expect(
      repair.runSerializableRepair(prisma, async (value) => {
        expect(value).toBe(transaction);
        return 'committed';
      }),
    ).resolves.toBe('committed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rolls back when applied-state validation fails', async () => {
    let storedStatus = 'draft';
    const prisma = {
      $transaction: jest.fn(
        async (work: (transaction: unknown) => Promise<unknown>) => {
          const before = storedStatus;
          try {
            return await work({
              write: () => {
                storedStatus = 'cancelled';
              },
            });
          } catch (error) {
            storedStatus = before;
            throw error;
          }
        },
      ),
    };
    const emptyDependencies = {
      reportIds: [],
      findingIds: [],
      correctiveActionIds: [],
      reviewIds: [],
      certificateIds: [],
      decisionIds: [],
      notificationIds: [],
    };

    await expect(
      repair.runSerializableRepair(prisma, async (transaction: unknown) => {
        (transaction as { write: () => void }).write();
        repair.validateAppliedState(
          { plans: [], files: [] },
          emptyDependencies,
        );
      }),
    ).rejects.toThrow(/transaction must roll back/i);
    expect(storedStatus).toBe('draft');
  });

  it('validates the applied state before creating the repair audit row', () => {
    const validationIndex = source.indexOf(
      'const appliedValidation = validateAppliedState(',
    );
    const auditIndex = source.indexOf('transaction.audit_logs.create');

    expect(validationIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeGreaterThan(validationIndex);
  });
});
