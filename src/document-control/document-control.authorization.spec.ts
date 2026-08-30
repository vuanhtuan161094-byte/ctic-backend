import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { DocumentControlController } from './document-control.controller';

function metadata(key: string, method: keyof DocumentControlController) {
    return Reflect.getMetadata(key, DocumentControlController.prototype[method]);
}

describe('DocumentControlController authorization metadata', () => {
    it.each([
        'listTemplates',
        'listDocuments',
        'findDocument',
    ] as Array<keyof DocumentControlController>)(
        '%s is internal-only and never grants CUSTOMER',
        (method) => {
            const roles = metadata(ROLES_KEY, method) as string[];
            expect(roles).toBeDefined();
            expect(roles).not.toContain('CUSTOMER');
            expect(metadata(PERMISSIONS_KEY, method)).toEqual(['documents.read']);
        },
    );

    it.each([
        'createTemplate',
        'createTemplateRevision',
        'approveTemplate',
        'makeTemplateEffective',
        'attachOfficialFile',
        'issueDocument',
        'voidDocumentVersion',
    ] as Array<keyof DocumentControlController>)(
        '%s requires server-side manage permission and never grants CUSTOMER',
        (method) => {
            const roles = metadata(ROLES_KEY, method) as string[];
            expect(roles).not.toContain('CUSTOMER');
            expect(metadata(PERMISSIONS_KEY, method)).toEqual(['documents.manage']);
        },
    );
});
