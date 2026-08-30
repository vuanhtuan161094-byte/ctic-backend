import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { GovernanceCasesController } from './governance-cases.controller';
import { GovernanceCasesPortalController } from './governance-cases.portal.controller';

describe('Governance cases authorization metadata', () => {
    it('keeps CUSTOMER out of every internal governance route', () => {
        const controllerRoles = Reflect.getMetadata(ROLES_KEY, GovernanceCasesController) as string[];
        expect(controllerRoles).not.toContain('CUSTOMER');
        expect(Reflect.getMetadata(PERMISSIONS_KEY, GovernanceCasesController)).toEqual(['projects.read']);
    });

    it('exposes portal routes only to CUSTOMER with customer_portal permission', () => {
        expect(Reflect.getMetadata(ROLES_KEY, GovernanceCasesPortalController)).toEqual(['CUSTOMER']);
        expect(Reflect.getMetadata(PERMISSIONS_KEY, GovernanceCasesPortalController)).toEqual(['customer_portal.access']);
    });

    it('keeps complaint and appeal decision routes role-restricted on the server', () => {
        const complaintClose = Reflect.getMetadata(
            ROLES_KEY,
            GovernanceCasesController.prototype.closeComplaint,
        ) as string[];
        const appealDecision = Reflect.getMetadata(
            ROLES_KEY,
            GovernanceCasesController.prototype.decideAppeal,
        ) as string[];
        expect(complaintClose).toEqual(expect.arrayContaining(['ADMIN', 'COORDINATOR', 'DECISION_MAKER']));
        expect(appealDecision).toEqual(expect.arrayContaining(['ADMIN', 'DECISION_MAKER']));
        expect(complaintClose).not.toContain('CUSTOMER');
        expect(appealDecision).not.toContain('CUSTOMER');
    });
});
