import {
    calculateSurveillanceChanges,
    summarizeSurveillanceChanges,
} from './surveillance-information.utils';

describe('surveillance information snapshots', () => {
    it('treats contact-only changes as administrative and keeps MD review optional', () => {
        const changes = calculateSurveillanceChanges(
            { contact_name: 'A', employee_count: 100, certification_scope: 'Scope A' },
            { contact_name: 'B', employee_count: 100, certification_scope: 'Scope A' },
        );
        const summary = summarizeSurveillanceChanges(changes);

        expect(changes).toHaveLength(1);
        expect(changes[0].category).toBe('ADMINISTRATIVE');
        expect(summary.change_impact).toBe('ADMINISTRATIVE');
        expect(summary.manday_review_recommended).toBe(false);
    });

    it('flags personnel, site and scope changes as potentially affecting MD', () => {
        const changes = calculateSurveillanceChanges(
            {
                employee_count: 100,
                certification_scope: 'Scope A',
                sites: [{ site_no: 1, address: 'A' }],
            },
            {
                employee_count: 180,
                certification_scope: 'Scope A + B',
                sites: [{ site_no: 1, address: 'A' }, { site_no: 2, address: 'B' }],
            },
        );
        const summary = summarizeSurveillanceChanges(changes);

        expect(summary.certification_relevant_count).toBe(3);
        expect(summary.manday_relevant_count).toBe(3);
        expect(summary.change_impact).toBe('CERTIFICATION_RELEVANT');
        expect(summary.manday_review_recommended).toBe(true);
        expect(summary.scope_review_required).toBe(true);
    });

    it('does not report a change when site objects only differ by empty optional values', () => {
        const changes = calculateSurveillanceChanges(
            { sites: [{ site_no: 1, address: 'A', site_name: null }] },
            { sites: [{ site_no: 1, address: 'A', site_name: '' }] },
        );

        expect(changes).toHaveLength(0);
    });

    it('treats null, empty string and undefined nested optional values as equivalent', () => {
        const snapshots = [null, '', undefined].map((siteName) => ({
            sites: [{ site_no: 1, address: 'A', site_name: siteName }],
        }));

        for (const baseline of snapshots) {
            for (const current of snapshots) {
                expect(calculateSurveillanceChanges(baseline, current)).toHaveLength(0);
            }
        }
    });

    it.each([null, '', undefined])(
        'does not treat nested 0 as equivalent to absent value %p',
        (absentValue) => {
            const changes = calculateSurveillanceChanges(
                { sites: [{ site_no: 1, employee_count: 0 }] },
                { sites: [{ site_no: 1, employee_count: absentValue }] },
            );

            expect(changes).toHaveLength(1);
            expect(changes[0].field).toBe('sites');
        },
    );

    it.each([null, '', undefined])(
        'does not treat nested false as equivalent to absent value %p',
        (absentValue) => {
            const changes = calculateSurveillanceChanges(
                { sites: [{ site_no: 1, external_provider_used: false }] },
                { sites: [{ site_no: 1, external_provider_used: absentValue }] },
            );

            expect(changes).toHaveLength(1);
            expect(changes[0].field).toBe('sites');
        },
    );
});
