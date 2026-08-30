import { BadRequestException } from '@nestjs/common';

import { CertificatesService } from './certificates.service';

function createService(status: string) {
    const certificate = {
        id:
            '00000000-0000-4000-8000-000000000051',
        verification_code:
            '00000000-0000-4000-8000-000000000052',
        cert_number:
            'CERT-2026-001',
        issue_date:
            new Date('2026-01-01T00:00:00.000Z'),
        expire_date:
            new Date('2029-12-31T00:00:00.000Z'),
        status,
        version_no:
            2,
        organization_name:
            'CTIC Customer',
        organization_address:
            'Ha Noi',
        management_system:
            'QMS',
        standard_name:
            'ISO 9001:2015',
        certification_scope:
            'Manufacturing',
        site_snapshot_json:
            null,
        certificate_series: {
            certificates: [
                {
                    id:
                        '00000000-0000-4000-8000-000000000051',
                    version_no:
                        2,
                    status,
                },
                {
                    id:
                        '00000000-0000-4000-8000-000000000053',
                    version_no:
                        1,
                    status:
                        'replaced',
                },
            ],
        },
    };
    const prisma = {
        certificates: {
            findUnique:
                jest.fn(async () => certificate),
        },
    };

    return {
        certificate,
        prisma,
        service:
            new CertificatesService(
                prisma as any,
                {} as any,
            ),
    };
}

describe('public certificate status projection', () => {
    it('resolves every verification code to its exact immutable lifecycle version', async () => {
        const versions = [
            {
                id: 'certificate-v1',
                verification_code: 'verification-v1',
                cert_number: 'CERT-001',
                issue_date: new Date('2023-01-01T00:00:00.000Z'),
                expire_date: new Date('2025-12-31T00:00:00.000Z'),
                status: 'replaced',
                version_no: 1,
                organization_name: 'Organization V1',
                organization_address: 'Address V1',
                management_system: 'QMS',
                standard_name: 'ISO 9001:2015',
                certification_scope: 'Scope V1',
                site_snapshot_json: '[]',
            },
            {
                id: 'certificate-v2',
                verification_code: 'verification-v2',
                cert_number: 'CERT-001',
                issue_date: new Date('2025-01-01T00:00:00.000Z'),
                expire_date: new Date('2026-12-31T00:00:00.000Z'),
                status: 'replaced',
                version_no: 2,
                organization_name: 'Organization V2',
                organization_address: 'Address V2',
                management_system: 'QMS',
                standard_name: 'ISO 9001:2015',
                certification_scope: 'Scope V2',
                site_snapshot_json: '[]',
            },
            {
                id: 'certificate-v3',
                verification_code: 'verification-v3',
                cert_number: 'CERT-001',
                issue_date: new Date('2026-08-21T00:00:00.000Z'),
                expire_date: new Date('2029-08-20T00:00:00.000Z'),
                status: 'active',
                version_no: 3,
                organization_name: 'Organization V3',
                organization_address: 'Address V3',
                management_system: 'QMS',
                standard_name: 'ISO 9001:2015',
                certification_scope: 'Scope V3',
                site_snapshot_json: '[]',
            },
        ];
        const seriesProjection = versions
            .map(({ id, version_no, status }) => ({ id, version_no, status }))
            .reverse();
        const prisma = {
            certificates: {
                findUnique: jest.fn(async ({ where }: any) => {
                    const version = versions.find((item) =>
                        item.verification_code === where.verification_code,
                    );
                    return version
                        ? {
                            ...version,
                            certificate_series: {
                                certificates: seriesProjection,
                            },
                        }
                        : null;
                }),
            },
        };
        const service = new CertificatesService(
            prisma as never,
            {} as never,
        );

        const projected = await Promise.all(
            versions.map((version) =>
                service.findPublicCertificate(
                    version.verification_code,
                ),
            ),
        );

        expect(projected.map((item) => ({
            version_no: item.version_no,
            status: item.status,
            organization_name: item.organization_name,
            certification_scope: item.certification_scope,
            is_current_version: item.is_current_version,
        }))).toEqual([
            {
                version_no: 1,
                status: 'replaced',
                organization_name: 'Organization V1',
                certification_scope: 'Scope V1',
                is_current_version: false,
            },
            {
                version_no: 2,
                status: 'replaced',
                organization_name: 'Organization V2',
                certification_scope: 'Scope V2',
                is_current_version: false,
            },
            {
                version_no: 3,
                status: 'active',
                organization_name: 'Organization V3',
                certification_scope: 'Scope V3',
                is_current_version: true,
            },
        ]);
    });

    it.each([
        ['active', 'Đang hiệu lực', true],
        ['suspended', 'Đình chỉ', false],
        ['withdrawn', 'Đã thu hồi', false],
    ] as const)(
        'returns existing %s certificate with business status %s',
        async (
            status,
            label,
            isValid,
        ) => {
            const harness =
                createService(
                    status,
                );

            const result =
                await harness.service.findPublicCertificate(
                    harness.certificate.verification_code,
                );

            expect(result.status).toBe(
                status,
            );
            expect(result.status_label).toBe(
                label,
            );
            expect(result.is_valid).toBe(
                isValid,
            );
            expect(result.is_current_version).toBe(
                true,
            );
        },
    );

    it('blocks direct lifecycle status bypass through the administrative endpoint', async () => {
        const harness =
            createService(
                'active',
            );

        await expect(
            harness.service.updateStatus(
                harness.certificate.id,
                {
                    status:
                        'suspended',
                    reason:
                        'Direct bypass attempt',
                    effective_date:
                        '2026-08-21',
                },
            ),
        ).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});
