import { BadRequestException } from '@nestjs/common';

import {
    APPLICATION_RUNTIME_PROGRAM_CODES,
    assertOperationalStandardSelection,
    operationalStandardWhere,
} from './operational-standard-policy';

describe('operational standard policy', () => {
    function harness(rows: Array<{ standard_code: string; edition: string }>) {
        return {
            standard_editions: {
                findMany: jest.fn().mockResolvedValue(rows),
            },
        } as any;
    }

    it('limits new application intake to management-system programmes supported end-to-end', () => {
        expect(APPLICATION_RUNTIME_PROGRAM_CODES).toEqual(['QMS', 'EMS', 'OHSMS']);
        const where = operationalStandardWhere(new Date('2026-09-12T00:00:00.000Z')) as any;
        expect(where.scheme.code.in).toEqual(['QMS', 'EMS', 'OHSMS']);
        expect(where.scheme.configurations.some.status).toBe('ACTIVE');
    });

    it('accepts a single operational edition and an integrated selection', async () => {
        const prisma = harness([
            { standard_code: 'ISO 9001', edition: '2015' },
            { standard_code: 'ISO 14001', edition: '2015' },
        ]);
        await expect(assertOperationalStandardSelection(prisma, 'ISO 9001:2015')).resolves.toBeUndefined();
        await expect(assertOperationalStandardSelection(prisma, 'ISO 9001:2015 + ISO 14001:2015')).resolves.toBeUndefined();
    });

    it('rejects a standard that is not operational for new business', async () => {
        const prisma = harness([{ standard_code: 'ISO 9001', edition: '2015' }]);
        await expect(
            assertOperationalStandardSelection(prisma, 'ISO 9001:2026'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
