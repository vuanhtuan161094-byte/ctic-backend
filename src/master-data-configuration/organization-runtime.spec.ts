import { MasterDataConfigurationService } from './master-data-configuration.service';
import { PlatformBrandingController } from './platform-branding.controller';
import { organizationReadiness, organizationReminderDays, readOrganizationTimezone, validOrganizationTimezone } from '../common/organization-runtime-settings';
import { numberingBusinessYear } from './numbering-runtime-policy';
import { DocumentControlService } from '../document-control/document-control.service';
import { CommercialManagementReportingService } from '../commercial-management-reporting/commercial-management-reporting.service';

const profile = { legal_name: 'Company', display_name: 'Company CB', short_name: 'CB', portal_title: 'Customer portal', timezone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN', default_language: 'vi', date_format: 'DD/MM/YYYY', certificate_reminder_days: 90 };
function harness() {
    const prisma: any = { organization_profiles: { findUnique: jest.fn().mockResolvedValue(profile), upsert: jest.fn(async ({ update }) => ({ id: 'org', ...update })) } };
    const service = new MasterDataConfigurationService(prisma, { write: jest.fn() } as any);
    return { prisma, service };
}
describe('CFG-1D organization semantics and readiness', () => {
    it.each([
        ['legal_name', '   '], ['display_name', '\t'], ['short_name', '\n'],
        ['email', 'not an email'], ['website', 'javascript:alert(1)'],
        ['timezone', 'Mars/Olympus'], ['timezone', '+07:00'],
        ['locale', 'en-US'], ['default_language', 'en'],
        ['certificate_reminder_days', -1], ['certificate_reminder_days', 1.5],
        ['file_retention_days', -1],
    ])('rejects invalid %s at the service boundary', async (field, value) => {
        const h = harness(); await expect(h.service.saveOrganizationProfile({ ...profile, [field]: value } as any, 'admin')).rejects.toThrow();
        expect(h.prisma.organization_profiles.upsert).not.toHaveBeenCalled();
    });
    it('normalizes valid values and preserves omitted legacy fields', async () => {
        const h = harness(); const result = await h.service.saveOrganizationProfile({ ...profile, legal_name: ' Company ', timezone: ' Europe/London ' }, 'admin');
        expect(result.legal_name).toBe('Company'); expect(result.timezone).toBe('Europe/London');
        const data = h.prisma.organization_profiles.upsert.mock.calls[0][0].update;
        for (const field of ['logo_reference', 'document_footer', 'file_retention_days']) expect(data[field]).toBeUndefined();
    });
    it('returns field-level reason codes instead of profile existence', () => {
        const state = organizationReadiness({ ...profile, display_name: ' ', timezone: 'bad' });
        expect(state.ready).toBe(false);
        expect(state.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ORGANIZATION_DISPLAY_NAME_MISSING', field: 'display_name' }), expect.objectContaining({ code: 'ORGANIZATION_TIMEZONE_INVALID', field: 'timezone' })]));
        expect(organizationReadiness(null).ready).toBe(false);
    });
    it('does not require dormant asset/footer/retention or date-format metadata for readiness', () => {
        expect(organizationReadiness({ ...profile, logo_reference: null, document_footer: null, file_retention_days: null, date_format: null }).ready).toBe(true);
    });
    it.each([undefined, null, -1, NaN, 9999, 2.5])('uses safe reminder fallback for %s', value => { expect(organizationReminderDays(value)).toBe(90); });
    it('preserves zero and configured reminder days', () => { expect(organizationReminderDays(0)).toBe(0); expect(organizationReminderDays(120)).toBe(120); });
    it('accepts IANA timezones and safely falls back for legacy invalid/missing profiles', async () => {
        const h = harness(); expect(validOrganizationTimezone('America/Los_Angeles')).toBe(true);
        h.prisma.organization_profiles.findUnique.mockResolvedValue({ timezone: 'invalid' }); expect(await readOrganizationTimezone(h.prisma)).toBe('Asia/Ho_Chi_Minh');
        h.prisma.organization_profiles.findUnique.mockResolvedValue(null); expect(await readOrganizationTimezone(h.prisma)).toBe('Asia/Ho_Chi_Minh');
    });
    it('changes future numbering year at the boundary without rewriting previously issued values', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-12-31T18:00:00Z'));
        try {
            const h = harness();
            expect((await h.service.numberingCapabilities()).preview_year).toBe(2027);
            const issued = `DOC-${numberingBusinessYear(new Date(), await readOrganizationTimezone(h.prisma))}-0001`;
            h.prisma.organization_profiles.findUnique.mockResolvedValue({ ...profile, timezone: 'America/Los_Angeles' });
            expect((await h.service.numberingCapabilities()).preview_year).toBe(2026);
            expect(issued).toBe('DOC-2027-0001');
            expect(h.prisma.organization_profiles.upsert).not.toHaveBeenCalled();
        } finally { jest.useRealTimers(); }
    });
    it('document numbering queries the governed timezone inside its transaction', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2027-01-01T01:00:00Z'));
        try {
            const allocator = Object.create(DocumentControlService.prototype) as DocumentControlService;
            const tx: any = { organization_profiles: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/Los_Angeles' }) }, $queryRaw: jest.fn().mockResolvedValue([{ prefix: 'DOC', next_value: 2 }]) };
            const issued = await allocator.allocateControlledNumber(tx, 'DOC');
            expect(issued).toBe('DOC-2026-0001');
            tx.organization_profiles.findUnique.mockResolvedValue({ timezone: 'Asia/Ho_Chi_Minh' });
            expect(await allocator.allocateControlledNumber(tx, 'DOC')).toBe('DOC-2027-0001');
            expect(issued).toBe('DOC-2026-0001');
            expect(await allocator.allocateControlledNumber(tx, 'DOC', 2025)).toBe('DOC-2025-0001');
        } finally { jest.useRealTimers(); }
    });
    it('reporting uses the same safe timezone authority', async () => {
        const h = harness(); h.prisma.organization_profiles.findUnique.mockResolvedValue({ timezone: 'Europe/London' });
        const reporting: any = Object.create(CommercialManagementReportingService.prototype); reporting.prisma = h.prisma;
        const context = await reporting.reportingContext({ preset: 'CUSTOM', from: '2026-08-01', to: '2026-08-31' });
        expect(JSON.stringify(context)).toContain('Europe/London');
    });
    it('customer-safe projection has exactly three allowlisted fields even if the provider returns extra data', async () => {
        const h = harness(); h.prisma.organization_profiles.findUnique.mockResolvedValue({ ...profile, logo_reference: 'private/path', file_retention_days: 999, updated_by: 'internal' });
        const result = await new PlatformBrandingController(h.prisma).branding();
        expect(result).toEqual({ display_name: profile.display_name, short_name: profile.short_name, portal_title: profile.portal_title });
        expect(h.prisma.organization_profiles.findUnique).toHaveBeenCalledWith({ where: { profile_key: 'PRIMARY' }, select: { display_name: true, short_name: true, portal_title: true } });
    });
});
