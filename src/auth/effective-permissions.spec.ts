import { resolveEffectivePermissionProfile } from './effective-permissions';

describe('resolveEffectivePermissionProfile', () => {
    it('adds explicit ALLOW and removes explicit DENY', () => {
        const result = resolveEffectivePermissionProfile(
            [
                'documents.read',
                'technical_reviews.read',
                'technical_reviews.perform',
            ],
            [
                {
                    permission_name: 'reports.manage',
                    effect: 'ALLOW',
                },
                {
                    permission_name: 'technical_reviews.perform',
                    effect: 'DENY',
                },
            ],
        );

        expect(result.base_permissions).toEqual([
            'documents.read',
            'technical_reviews.perform',
            'technical_reviews.read',
        ]);
        expect(result.allow_overrides).toEqual([
            'reports.manage',
        ]);
        expect(result.deny_overrides).toEqual([
            'technical_reviews.perform',
        ]);
        expect(result.effective_permissions).toEqual([
            'documents.read',
            'reports.manage',
            'technical_reviews.read',
        ]);
    });

    it('normalizes and deduplicates permission names', () => {
        const result = resolveEffectivePermissionProfile(
            [
                ' Documents.Read ',
                'documents.read',
            ],
            [
                {
                    permission_name: 'REPORTS.MANAGE',
                    effect: 'allow',
                },
                {
                    permission_name: 'reports.manage',
                    effect: 'ALLOW',
                },
            ],
        );

        expect(result.effective_permissions).toEqual([
            'documents.read',
            'reports.manage',
        ]);
    });
});
