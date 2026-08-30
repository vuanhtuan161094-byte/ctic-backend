import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { CommercialManagementReportingController } from './commercial-management-reporting.controller';

function metadata(key: string, method: keyof CommercialManagementReportingController) {
    return Reflect.getMetadata(key, CommercialManagementReportingController.prototype[method]);
}

describe('CommercialManagementReportingController authorization', () => {
    it.each([
        'quotations', 'quotation', 'billingMilestones', 'cockpit', 'exportCockpit',
    ] as Array<keyof CommercialManagementReportingController>)('%s excludes CUSTOMER and technical-only roles server-side', (method) => {
        const roles = metadata(ROLES_KEY, method) as string[];
        expect(roles).toEqual(['ADMIN', 'STAFF', 'SALES', 'COORDINATOR']);
        expect(roles).not.toContain('CUSTOMER');
        expect(roles).not.toContain('AUDITOR');
        expect(roles).not.toContain('TECHNICAL_REVIEWER');
    });

    it.each([
        'createQuotation', 'updateQuotation', 'transitionQuotation', 'reviseQuotation',
        'createBillingMilestone', 'updateBillingMilestone',
    ] as Array<keyof CommercialManagementReportingController>)('%s requires commercial write role and contracts.manage', (method) => {
        expect(metadata(ROLES_KEY, method)).toEqual(['ADMIN', 'STAFF', 'SALES']);
        expect(metadata(PERMISSIONS_KEY, method)).toEqual(['contracts.manage']);
    });

    it('uses dashboard.read for cockpit/export and contracts.read for financial records', () => {
        expect(metadata(PERMISSIONS_KEY, 'cockpit')).toEqual(['dashboard.read']);
        expect(metadata(PERMISSIONS_KEY, 'exportCockpit')).toEqual(['dashboard.read']);
        expect(metadata(PERMISSIONS_KEY, 'quotations')).toEqual(['contracts.read']);
        expect(metadata(PERMISSIONS_KEY, 'billingMilestones')).toEqual(['contracts.read']);
    });
});
