import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { MasterDataConfigurationController } from './master-data-configuration.controller';

function metadata(key: string, method: keyof MasterDataConfigurationController) {
    return Reflect.getMetadata(key, MasterDataConfigurationController.prototype[method]);
}

describe('MasterDataConfigurationController authorization', () => {
    it.each([
        'listSchemes', 'listStandards', 'listConfigurations', 'resolveConfiguration',
        'getOrganizationProfile', 'listNumberingSeries',
    ] as Array<keyof MasterDataConfigurationController>)('%s is internal-only', (method) => {
        const roles = metadata(ROLES_KEY, method) as string[];
        expect(roles).toBeDefined();
        expect(roles).not.toContain('CUSTOMER');
        expect(metadata(PERMISSIONS_KEY, method)).toEqual(['classifications.read']);
    });

    it.each([
        'createScheme', 'updateScheme', 'createStandard', 'updateStandard',
        'createConfiguration', 'activateConfiguration', 'saveOrganizationProfile',
        'createNumberingSeries', 'importDefinitions', 'listImports', 'validateImport',
        'getImport', 'commitImport',
    ] as Array<keyof MasterDataConfigurationController>)('%s is ADMIN-only server-side', (method) => {
        expect(metadata(ROLES_KEY, method)).toEqual(['ADMIN']);
        expect(metadata(PERMISSIONS_KEY, method)).toEqual(['classifications.manage']);
    });
});
