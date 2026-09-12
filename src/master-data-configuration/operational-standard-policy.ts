import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';

/**
 * Application intake is currently implemented end-to-end for these management
 * system programmes. Master/configuration data may remain more generic, but an
 * edition must not become selectable for a new application until the runtime
 * review, capability and manday workflow supports its programme.
 */
export const APPLICATION_RUNTIME_PROGRAM_CODES = [
    'QMS',
    'EMS',
    'OHSMS',
];

export function operationalStandardDate() {
    const now = new Date();
    return new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
    ));
}

export function operationalStandardWhere(at = operationalStandardDate()) {
    return {
        status: 'ACTIVE',
        effective_from: { lte: at },
        OR: [
            { withdrawn_at: null },
            { withdrawn_at: { gt: at } },
        ],
        scheme: {
            code: { in: APPLICATION_RUNTIME_PROGRAM_CODES },
            status: 'ACTIVE',
            AND: [
                {
                    OR: [
                        { effective_from: null },
                        { effective_from: { lte: at } },
                    ],
                },
                {
                    OR: [
                        { effective_to: null },
                        { effective_to: { gte: at } },
                    ],
                },
                {
                    configurations: {
                        some: {
                            status: 'ACTIVE',
                            effective_from: { lte: at },
                            OR: [
                                { effective_to: null },
                                { effective_to: { gte: at } },
                            ],
                        },
                    },
                },
            ],
        },
    };
}

export function standardEditionBusinessLabel(input: {
    standard_code: string;
    edition: string;
}) {
    const code = input.standard_code.trim();
    const edition = input.edition.trim();
    return edition && !code.toUpperCase().includes(edition.toUpperCase())
        ? `${code}:${edition}`
        : code;
}

function normalizeLabel(value: string) {
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function parseStandardSelection(value: string) {
    return value
        .split(/\s+\+\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export async function assertOperationalStandardSelection(
    prisma: Pick<PrismaService, 'standard_editions'>,
    value: string,
) {
    const requested = parseStandardSelection(value);
    if (!requested.length) {
        throw new BadRequestException('Chọn ít nhất một tiêu chuẩn đang áp dụng');
    }

    const rows = await prisma.standard_editions.findMany({
        where: operationalStandardWhere(),
        select: {
            standard_code: true,
            edition: true,
        },
        take: 300,
    });
    const allowed = new Set(
        rows.map((row) => normalizeLabel(standardEditionBusinessLabel(row))),
    );
    const invalid = requested.filter((item) => !allowed.has(normalizeLabel(item)));

    if (invalid.length) {
        throw new BadRequestException(
            `Tiêu chuẩn không còn sẵn sàng cho hồ sơ mới: ${invalid.join(', ')}. ` +
            'Hãy chọn lại từ danh sách Chương trình & tiêu chuẩn đang áp dụng.',
        );
    }
}
