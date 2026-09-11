import { NotFoundException } from '@nestjs/common';

import { AuditDocumentQueryContextService } from './audit-document-query-context.service';

describe('AuditDocumentQueryContextService', () => {
    function createPrisma() {
        return {
            audit_plans: {
                findUnique: jest.fn(),
            },
            organization_profiles: {
                findUnique: jest.fn(),
            },
            audit_programs: {
                findUnique: jest.fn(),
            },
        } as any;
    }

    it('loads the audit plan and attaches the current platform branding snapshot', async () => {
        const prisma = createPrisma();
        prisma.audit_plans.findUnique.mockResolvedValue({ id: 'plan-1' });
        prisma.organization_profiles.findUnique.mockResolvedValue({
            profile_key: 'PRIMARY',
            certification_body_name: 'Example CB',
        });
        const service = new AuditDocumentQueryContextService(prisma);

        const result = await service.loadPlan('plan-1');

        expect(result).toEqual(expect.objectContaining({
            id: 'plan-1',
            platform_branding: expect.objectContaining({ profile_key: 'PRIMARY' }),
        }));
        expect(prisma.audit_plans.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'plan-1' } }),
        );
        expect(prisma.organization_profiles.findUnique).toHaveBeenCalledWith({
            where: { profile_key: 'PRIMARY' },
        });
    });

    it('throws when the audit plan does not exist', async () => {
        const prisma = createPrisma();
        prisma.audit_plans.findUnique.mockResolvedValue(null);
        const service = new AuditDocumentQueryContextService(prisma);

        await expect(service.loadPlan('missing')).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.organization_profiles.findUnique).not.toHaveBeenCalled();
    });

    it('returns null without querying when no program id is supplied', async () => {
        const prisma = createPrisma();
        const service = new AuditDocumentQueryContextService(prisma);

        await expect(service.loadProgram(null)).resolves.toBeNull();
        expect(prisma.audit_programs.findUnique).not.toHaveBeenCalled();
    });

    it('loads the audit program context when an id is supplied', async () => {
        const prisma = createPrisma();
        prisma.audit_programs.findUnique.mockResolvedValue({ id: 'program-1' });
        const service = new AuditDocumentQueryContextService(prisma);

        await expect(service.loadProgram('program-1')).resolves.toEqual({ id: 'program-1' });
        expect(prisma.audit_programs.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'program-1' } }),
        );
    });
});
