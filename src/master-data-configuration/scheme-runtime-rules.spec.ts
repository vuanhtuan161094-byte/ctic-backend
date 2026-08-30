import {
    expiryDateFromValidityMonths,
    resolveSchemeRuntimeRules,
} from './scheme-runtime-rules';

describe('scheme runtime rules', () => {
    it('keeps the historical baseline when a project has no snapshot', () => {
        const result = resolveSchemeRuntimeRules(null);
        expect(result.source).toBe('CODE_DEFAULT');
        expect(result.stage1_applicable).toBe(true);
        expect(result.surveillance_frequency_months).toBe(12);
        expect(result.validity_duration_months).toBe(36);
        expect(result.renewal_window_days).toBe(90);
        expect(result.reminder_lead_days).toBe(60);
    });

    it('uses the configuration frozen into the project snapshot', () => {
        const result = resolveSchemeRuntimeRules(JSON.stringify([{
            scheme: { code: 'QMS' },
            configuration: {
                id: 'config-qms-v2',
                cycle_duration_months: 36,
                surveillance_frequency_months: 10,
                validity_duration_months: 30,
                renewal_window_days: 120,
                reminder_lead_days: 75,
                stage1_applicable: false,
                required_audit_types: 'INITIAL_STAGE_2,SURVEILLANCE,RECERTIFICATION',
                required_decision_types: 'GRANT,MAINTAIN,RENEW',
            },
        }]));

        expect(result.source).toBe('PROJECT_SNAPSHOT');
        expect(result.scheme_codes).toEqual(['QMS']);
        expect(result.configuration_ids).toEqual(['config-qms-v2']);
        expect(result.stage1_applicable).toBe(false);
        expect(result.surveillance_frequency_months).toBe(10);
        expect(result.validity_duration_months).toBe(30);
        expect(result.renewal_window_days).toBe(120);
        expect(result.reminder_lead_days).toBe(75);
    });

    it('merges an IMS snapshot conservatively instead of weakening a stricter scheme', () => {
        const result = resolveSchemeRuntimeRules(JSON.stringify([
            {
                scheme: { code: 'QMS' },
                configuration: {
                    id: 'qms',
                    cycle_duration_months: 36,
                    surveillance_frequency_months: 12,
                    validity_duration_months: 36,
                    renewal_window_days: 90,
                    reminder_lead_days: 60,
                    stage1_applicable: false,
                    required_audit_types: 'INITIAL_STAGE_2,SURVEILLANCE',
                    required_decision_types: 'GRANT,MAINTAIN',
                },
            },
            {
                scheme: { code: 'EMS' },
                configuration: {
                    id: 'ems',
                    cycle_duration_months: 30,
                    surveillance_frequency_months: 10,
                    validity_duration_months: 30,
                    renewal_window_days: 120,
                    reminder_lead_days: 75,
                    stage1_applicable: true,
                    required_audit_types: 'INITIAL_STAGE_1,INITIAL_STAGE_2,RECERTIFICATION',
                    required_decision_types: 'GRANT,RENEW',
                },
            },
        ]));

        expect(result.cycle_duration_months).toBe(30);
        expect(result.surveillance_frequency_months).toBe(10);
        expect(result.validity_duration_months).toBe(30);
        expect(result.renewal_window_days).toBe(120);
        expect(result.reminder_lead_days).toBe(75);
        expect(result.stage1_applicable).toBe(true);
        expect(result.required_audit_types).toEqual(expect.arrayContaining([
            'INITIAL_STAGE_1',
            'INITIAL_STAGE_2',
            'SURVEILLANCE',
            'RECERTIFICATION',
        ]));
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('calculates certificate expiry as validity months minus one day', () => {
        const expiry = expiryDateFromValidityMonths(
            new Date('2026-07-27T00:00:00.000Z'),
            36,
        );
        expect(expiry.toISOString().slice(0, 10)).toBe('2029-07-26');
    });

    it('fails closed to the compatible baseline for malformed snapshots', () => {
        const result = resolveSchemeRuntimeRules('{bad json');
        expect(result.source).toBe('CODE_DEFAULT');
        expect(result.stage1_applicable).toBe(true);
        expect(result.warnings[0]).toContain('lỗi JSON');
    });
});
