import { summarizeDossierItems, type DossierItemStatus } from './certification-projects.service';

const items = (...statuses: DossierItemStatus[]) => statuses.map((status) => ({ status }));

describe('certification dossier summary', () => {
    it('keeps not-applicable components visible and treats them as satisfied', () => {
        const summary = summarizeDossierItems(items(
            ...Array<DossierItemStatus>(13).fill('completed'),
            'not_applicable',
        ));

        expect(summary).toEqual({
            total_items: 14,
            completed_items: 14,
            pending_items: 0,
            completion_percentage: 100,
            dossier_status: 'completed',
        });
    });

    it('counts only pending components as incomplete', () => {
        const summary = summarizeDossierItems(items(
            ...Array<DossierItemStatus>(12).fill('completed'),
            'not_applicable',
            'pending',
        ));

        expect(summary).toEqual({
            total_items: 14,
            completed_items: 13,
            pending_items: 1,
            completion_percentage: 93,
            dossier_status: 'in_progress',
        });
    });

    it('keeps an empty dossier in not-started state', () => {
        expect(summarizeDossierItems([])).toEqual({
            total_items: 0,
            completed_items: 0,
            pending_items: 0,
            completion_percentage: 0,
            dossier_status: 'not_started',
        });
    });
});
