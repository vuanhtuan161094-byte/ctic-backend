import {
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import {
    plainToInstance,
} from 'class-transformer';
import {
    validate,
} from 'class-validator';

import {
    CreateNumberingSeriesDto,
} from './dto/master-data-configuration.dto';
import {
    CONFIGURABLE_NUMBERING_ENTITY_TYPES,
    numberingBusinessDate,
    numberingCapabilities,
    numberingRuleLifecycleState,
} from './numbering-runtime-policy';
import {
    MasterDataConfigurationService,
} from './master-data-configuration.service';

const adminId = '10000000-0000-4000-8000-000000000001';

function rule(overrides: Record<string, unknown> = {}) {
    return {
        id: '20000000-0000-4000-8000-000000000001',
        series_key: 'CMP',
        entity_type: 'COMPLAINT',
        prefix: 'CMP',
        padding: 4,
        status: 'ACTIVE',
        effective_from: new Date('2026-01-01T00:00:00.000Z'),
        effective_to: null,
        created_by: adminId,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
    };
}

function harness() {
    const numbering = {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
    };
    const tx: any = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        numbering_series_configs: numbering,
    };
    const prisma: any = {
        $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) =>
            callback(tx)),
        numbering_series_configs: numbering,
        certification_schemes: { findMany: jest.fn().mockResolvedValue([]) },
        organization_profiles: { findUnique: jest.fn().mockResolvedValue({ id: 'profile' }) },
        industry_classifications: { count: jest.fn().mockResolvedValue(1) },
        iaf_scopes: { count: jest.fn().mockResolvedValue(1) },
        industry_code_mappings: { count: jest.fn().mockResolvedValue(1) },
        nace_iaf_mappings: { count: jest.fn().mockResolvedValue(1) },
    };
    const audit: any = { write: jest.fn().mockResolvedValue(undefined) };
    return {
        audit,
        numbering,
        prisma,
        service: new MasterDataConfigurationService(prisma, audit),
        tx,
    };
}

describe('CFG-1A numbering runtime authority', () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(
            new Date('2026-09-13T05:00:00.000Z'),
        );
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('publishes only the five real controlled-numbering consumers', () => {
        const contract = numberingCapabilities();
        expect(contract.configurable_entities.map((item) => item.entity_type))
            .toEqual([...CONFIGURABLE_NUMBERING_ENTITY_TYPES]);
        expect(contract.non_configurable_entities.map((item) => item.entity_type))
            .toEqual(['APPLICATION', 'CERTIFICATE']);
        expect(contract.sequence_authority)
            .toBe('NORMALIZED_VISIBLE_PREFIX_PER_BUSINESS_YEAR');
    });

    it.each(['APPLICATION', 'CERTIFICATE'])(
        'rejects %s in DTO validation and service authority',
        async (entityType) => {
            const dto = plainToInstance(CreateNumberingSeriesDto, {
                entity_type: entityType,
                prefix: 'CFG',
                padding: 4,
                effective_from: '2026-09-13',
            });
            expect(await validate(dto)).not.toHaveLength(0);
            const { service, prisma } = harness();
            await expect(service.createNumberingSeries(
                dto,
                adminId,
            )).rejects.toBeInstanceOf(BadRequestException);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        },
    );

    it('derives the persisted legacy series key from the real prefix namespace', async () => {
        const { numbering, prisma, service, tx } = harness();
        numbering.findFirst.mockResolvedValue(null);
        numbering.create.mockImplementation(async ({ data }) => rule({
            id: 'created',
            ...data,
        }));

        const created = await service.createNumberingSeries({
            entity_type: 'COMPLAINT',
            prefix: ' cmp ',
            padding: 5,
            effective_from: '2026-09-13',
        }, adminId);

        expect(numbering.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                series_key: 'CMP',
                prefix: 'CMP',
            }),
        });
        expect(created).toEqual(expect.objectContaining({
            runtime_series_key: 'CMP',
            legacy_series_key_mismatch: false,
        }));
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
        expect(prisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ isolationLevel: 'Serializable' }),
        );
    });

    it('schedules a replacement and closes the current rule on the previous day', async () => {
        const { audit, numbering, service } = harness();
        const current = rule();
        numbering.findUnique.mockResolvedValue(current);
        numbering.findFirst.mockResolvedValue(null);
        numbering.update.mockImplementation(async ({ data }) => ({
            ...current,
            ...data,
        }));
        numbering.create.mockImplementation(async ({ data }) => rule({
            id: '30000000-0000-4000-8000-000000000001',
            ...data,
        }));

        const result = await service.replaceNumberingSeries(
            current.id,
            {
                prefix: 'CMP',
                padding: 5,
                effective_from: '2026-10-01',
                reason: 'Đổi độ dài số chạy',
            },
            adminId,
        );

        expect(numbering.update).toHaveBeenCalledWith({
            where: { id: current.id },
            data: { effective_to: new Date('2026-09-30T00:00:00.000Z') },
        });
        expect(result.rule.lifecycle_state).toBe('SCHEDULED');
        expect(result.previous_rule.lifecycle_state).toBe('CURRENT');
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
            action: 'NUMBERING_CONFIG_REPLACED',
            details: expect.objectContaining({
                previous_rule_id: current.id,
                runtime_series_key: 'CMP',
            }),
        }));
    });

    it('cancels a future replacement and restores the adjacent current rule', async () => {
        const { numbering, service } = harness();
        const scheduled = rule({
            id: '30000000-0000-4000-8000-000000000001',
            padding: 5,
            effective_from: new Date('2026-10-01T00:00:00.000Z'),
        });
        const previous = rule({
            effective_to: new Date('2026-09-30T00:00:00.000Z'),
        });
        numbering.findUnique.mockResolvedValue(scheduled);
        numbering.findFirst
            .mockResolvedValueOnce(previous)
            .mockResolvedValueOnce(null);
        numbering.update
            .mockImplementationOnce(async ({ data }) => ({
                ...scheduled,
                ...data,
            }))
            .mockImplementationOnce(async ({ data }) => ({
                ...previous,
                ...data,
            }));

        const result = await service.cancelScheduledNumberingSeries(
            scheduled.id,
            { reason: 'Không còn áp dụng thay đổi' },
            adminId,
        );

        expect(result.rule.lifecycle_state).toBe('CANCELLED');
        expect(result.previous_rule).toEqual(expect.objectContaining({
            id: previous.id,
            effective_to: null,
            lifecycle_state: 'CURRENT',
        }));
        expect(numbering.update).toHaveBeenLastCalledWith({
            where: { id: previous.id },
            data: { effective_to: null },
        });
    });

    it('ends a current rule without deleting or rewriting its start/prefix', async () => {
        const { numbering, service } = harness();
        const current = rule();
        numbering.findUnique.mockResolvedValue(current);
        numbering.findFirst.mockResolvedValue(null);
        numbering.update.mockImplementation(async ({ data }) => ({
            ...current,
            ...data,
        }));

        await service.endNumberingSeries(current.id, {
            effective_to: '2026-09-30',
            reason: 'Kết thúc sử dụng quy tắc',
        }, adminId);

        expect(numbering.update).toHaveBeenCalledWith({
            where: { id: current.id },
            data: { effective_to: new Date('2026-09-30T00:00:00.000Z') },
        });
        expect(numbering.update).not.toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ prefix: expect.anything() }),
        }));
    });

    it('rejects a replacement that overlaps another active or scheduled rule', async () => {
        const { numbering, service } = harness();
        const current = rule();
        numbering.findUnique.mockResolvedValue(current);
        numbering.findFirst.mockResolvedValue(rule({ id: 'other' }));

        await expect(service.replaceNumberingSeries(current.id, {
            prefix: 'CMP',
            padding: 5,
            effective_from: '2026-10-01',
            reason: 'Overlap must fail',
        }, adminId)).rejects.toBeInstanceOf(ConflictException);
        expect(numbering.update).not.toHaveBeenCalled();
        expect(numbering.create).not.toHaveBeenCalled();
    });

    it('keeps Special Audit actionable but non-blocking in global readiness', async () => {
        const { numbering, service } = harness();
        numbering.findMany.mockResolvedValue(
            ['DOCUMENT', 'COMPLAINT', 'APPEAL', 'CHANGE'].map((entityType) =>
                rule({ id: entityType, entity_type: entityType })),
        );

        const result = await service.configurationReadiness();

        expect(result.numbering.ready).toBe(true);
        expect(result.numbering.missing_entity_types).toEqual([]);
        expect(result.numbering.reasons).toContainEqual(expect.objectContaining({
            code: 'NUMBERING_RULE_MISSING',
            entity_type: 'SPECIAL_AUDIT',
            label: 'Đánh giá đặc biệt',
            blocking: false,
        }));
    });

    it('uses inclusive date boundaries for current, scheduled and historical states', () => {
        const today = numberingBusinessDate(
            new Date('2026-09-13T05:00:00.000Z'),
        );
        expect(numberingRuleLifecycleState(rule({
            effective_to: new Date('2026-09-13T00:00:00.000Z'),
        }), today)).toBe('CURRENT');
        expect(numberingRuleLifecycleState(rule({
            effective_from: new Date('2026-09-14T00:00:00.000Z'),
        }), today)).toBe('SCHEDULED');
        expect(numberingRuleLifecycleState(rule({
            effective_to: new Date('2026-09-12T00:00:00.000Z'),
        }), today)).toBe('HISTORICAL');
    });
});
