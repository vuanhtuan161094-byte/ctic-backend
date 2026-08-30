import { readFileSync } from 'fs';
import { join } from 'path';

describe('certification project surveillance dossier architecture', () => {
    const source = readFileSync(
        join(__dirname, 'certification-projects.service.ts'),
        'utf8',
    );

    it('normalizes duplicate technical plans into exactly four business-cycle dossiers', () => {
        expect(source).toContain('const surveillance1CyclePlans = plans.filter');
        expect(source).toContain('const surveillance2CyclePlans = plans.filter');
        expect(source).toContain('const recertificationDossier = createSingleAuditDossier');
        expect(source).not.toContain('const extraDossiers = plans');

        const dossierArray = source.slice(
            source.indexOf('const dossiers = ['),
            source.indexOf('const allItems = ['),
        );
        expect(dossierArray).toContain('initialDossier');
        expect(dossierArray).toContain('surveillance1Dossier');
        expect(dossierArray).toContain('surveillance2Dossier');
        expect(dossierArray).toContain('recertificationDossier');
        expect(dossierArray).not.toContain('extra_');
    });

    it('keeps surveillance snapshots and next actions attached to the exact event and plan', () => {
        expect(source).toContain("['confirmed', 'reviewed'].includes(normalize(informationSnapshot.status))");
        expect(source).toContain('surveillanceNextAction({');
        expect(source).toContain('eventId: surveillanceEvent.id');
        expect(source).toContain('planId: plan?.id ?? null');
    });
});
