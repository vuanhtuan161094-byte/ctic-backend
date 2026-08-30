import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { SystemAdministrationController } from './system-administration.controller';

describe('SystemAdministrationController authorization', () => {
    it('is ADMIN-only and requires the existing users.read permission', () => {
        expect(Reflect.getMetadata(ROLES_KEY, SystemAdministrationController)).toEqual(['ADMIN']);
        expect(Reflect.getMetadata(PERMISSIONS_KEY, SystemAdministrationController)).toEqual(['users.read']);
    });

    it('exposes read-only administration endpoints only', () => {
        const methods = Object.getOwnPropertyNames(SystemAdministrationController.prototype)
            .filter((name) => name !== 'constructor');
        expect(methods).toEqual(expect.arrayContaining([
            'overview', 'customerAccess', 'notifications', 'imports', 'documentGovernance', 'health',
        ]));
        expect(methods.some((name) => /create|update|delete|grant|revoke|run/i.test(name))).toBe(false);
    });
});
