import { PrismaService } from '../prisma/prisma.service';
import { AuditTeamProjectScopeService } from './audit-team-project-scope.service';

function approvedScope(id = 'scope-1') {
    return {
        id,
        standard_code: 'ISO 9001:2015',
        scope_description: 'Manufacturing',
        isic_nace_mapping: {
            source_code: { code: '2220', revision: '4', title_vi: null, title_en: 'Manufacture' },
            target_code: { code: '22.20', revision: '2', title_vi: null, title_en: 'Manufacture' },
        },
        nace_iaf_mapping: {
            nace_code: { code: '22.20' },
            iaf_scope: { iaf_code: '14', iaf_name: 'Rubber and plastic products' },
        },
    };
}

describe('AuditTeamProjectScopeService', () => {
    it('returns members unchanged when no project scope ids are selected', async () => {
        const findMany = jest.fn();
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany },
        } as unknown as PrismaService);
        const members = [{
            expert_id: 'expert-1',
            team_role: 'TEAM_LEADER',
            scopes: [],
        }] as any;

        await expect(service.resolveMemberScopes(members, 'project-1')).resolves.toBe(members);
        expect(findMany).not.toHaveBeenCalled();
    });

    it('hydrates approved project-scope classification fields without replacing explicit activity text', async () => {
        const findMany = jest.fn().mockResolvedValue([approvedScope()]);
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany },
        } as unknown as PrismaService);
        const members = [{
            expert_id: 'expert-1',
            team_role: 'TEAM_LEADER',
            scopes: [{
                project_scope_id: 'scope-1',
                iaf_code: null,
                nace_code: null,
                activity_description: 'Assembly',
            }],
        }] as any;

        const result = await service.resolveMemberScopes(members, 'project-1');
        expect(result[0].scopes?.[0]).toEqual(expect.objectContaining({
            project_scope_id: 'scope-1',
            iaf_code: '14',
            nace_code: '22.20',
            activity_description: 'Assembly',
        }));
    });

    it('rejects scopes that are not approved for the project', async () => {
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany: jest.fn().mockResolvedValue([]) },
        } as unknown as PrismaService);
        const members = [{
            expert_id: 'expert-1',
            team_role: 'TEAM_LEADER',
            scopes: [{ project_scope_id: 'scope-missing' }],
        }] as any;

        await expect(service.resolveMemberScopes(members, 'project-1'))
            .rejects.toThrow('Có phạm vi chưa được phê duyệt hoặc không thuộc dự án này');
    });

    it('requires the team to cover every approved project scope', async () => {
        const scopes = [approvedScope('scope-1'), approvedScope('scope-2')];
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany: jest.fn().mockResolvedValue(scopes) },
        } as unknown as PrismaService);

        await expect(service.validateProjectScopeUsage('project-1', [{
            team_role: 'TEAM_LEADER',
            scopes: [{ project_scope_id: 'scope-1' }],
        }])).rejects.toThrow('Tổng thể đoàn chưa bao phủ đầy đủ phạm vi đã duyệt');
    });

    it('accepts full approved project-scope coverage', async () => {
        const scopes = [approvedScope('scope-1'), approvedScope('scope-2')];
        const service = new AuditTeamProjectScopeService({
            certification_project_scopes: { findMany: jest.fn().mockResolvedValue(scopes) },
        } as unknown as PrismaService);

        await expect(service.validateProjectScopeUsage('project-1', [{
            team_role: 'TEAM_LEADER',
            scopes: [
                { project_scope_id: 'scope-1' },
                { project_scope_id: 'scope-2' },
            ],
        }])).resolves.toBeUndefined();
    });
});
