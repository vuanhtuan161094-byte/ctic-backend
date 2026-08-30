import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('duplicate operational PLAN repair audit script', () => {
    const source = readFileSync(
        join(
            process.cwd(),
            'scripts',
            'audit-duplicate-operational-plans-dry-run-patch36d.cjs',
        ),
        'utf8',
    );

    it('is read-only, rejects apply mode, and exposes all reconciliation references', () => {
        expect(source).toContain('const DRY_RUN = true;');
        expect(source).toContain("argument === '--apply'");
        expect(source).toContain('destructive_operations: false');
        expect(source).toContain("form: 'F.09'");
        expect(source).toContain("form: 'F.10'");
        expect(source).toContain('corrective_actions: true');
        expect(source).not.toMatch(
            /prisma\.[A-Za-z0-9_]+\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/,
        );
    });
});
