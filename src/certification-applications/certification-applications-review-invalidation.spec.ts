import { BadRequestException } from '@nestjs/common';

import { CertificationApplicationsService } from './certification-applications.service';

const baseDto = {
    customer_id: 'customer-1',
    application_code: 'APP-1',
    application_date: '2026-08-12',
    certification_type: 'INITIAL',
    standard_name: 'ISO 9001:2015',
    certification_scope: 'Manufacture of plastic products',
    headquarters_address: 'Site A',
    site_count: 1,
    total_employee_count: 100,
    employee_count: 100,
    shift_count: 1,
    shift1_count: 100,
    external_provider_used: false,
    other_management_systems: false,
    declaration_accepted: true,
    sites: [{
        site_no: 1,
        site_name: 'Site A',
        address: 'Site A',
        activities: 'Manufacture of plastic products',
        employee_count: 100,
        is_headquarters: true,
    }],
};

function existingApplication(workflowStatus = 'APPROVED') {
    return {
        id: 'application-1',
        customer_id: 'customer-1',
        application_code: 'APP-1',
        application_date: new Date('2026-08-12'),
        certification_type: 'INITIAL',
        other_certification_type: null,
        standard_name: 'ISO 9001:2015',
        certification_scope: 'Manufacture of plastic products',
        excluded_clauses: null,
        headquarters_address: 'Site A',
        total_employee_count: 100,
        employee_count: 100,
        shift_count: 1,
        shift1_count: 100,
        shift2_count: null,
        shift3_count: null,
        external_provider_used: false,
        outsourced_processes: null,
        other_management_systems: false,
        management_system_details: null,
        status: 'accepted',
        sites: [{
            site_no: 1,
            site_name: 'Site A',
            address: 'Site A',
            activities: 'Manufacture of plastic products',
            employee_count: 100,
            is_headquarters: true,
        }],
        certification_projects: [],
        application_reviews: [{
            id: 'review-1',
            workflow_status: workflowStatus,
            prepared_by_id: 'preparer-1',
        }],
    };
}

function createHarness(workflowStatus = 'APPROVED') {
    const tx = {
        certification_application_sites: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        certification_applications: {
            update: jest.fn().mockResolvedValue({}),
            findUnique: jest.fn().mockResolvedValue({ id: 'application-1' }),
        },
        application_reviews: {
            update: jest.fn().mockResolvedValue({}),
        },
        application_review_actions: {
            create: jest.fn().mockResolvedValue({}),
        },
        notifications: {
            upsert: jest.fn().mockResolvedValue({}),
        },
    };
    const prisma = {
        certification_applications: {
            findUnique: jest.fn().mockResolvedValue(existingApplication(workflowStatus)),
            findFirst: jest.fn().mockResolvedValue(null),
        },
        customers: {
            findUnique: jest.fn().mockResolvedValue({
                id: 'customer-1',
                address: 'Site A',
                status: 'active',
            }),
        },
        $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new CertificationApplicationsService(prisma as any);
    return { prisma, tx, service };
}

describe('CertificationApplicationsService approved-review invalidation', () => {
    it('invalidates an APPROVED review when a material input changes', async () => {
        const { service, tx } = createHarness('APPROVED');
        await service.update(
            'application-1',
            {
                ...baseDto,
                certification_scope: 'Manufacture and assembly of plastic products',
                sites: [{
                    ...baseDto.sites[0],
                    activities: 'Manufacture and assembly of plastic products',
                }],
            } as any,
            'editor-1',
        );

        expect(tx.application_reviews.update).toHaveBeenCalledWith({
            where: { id: 'review-1' },
            data: expect.objectContaining({
                workflow_status: 'RETURNED',
                approved_at: null,
            }),
        });
        expect(tx.application_review_actions.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: 'INVALIDATE_APPLICATION_CHANGE',
                from_status: 'APPROVED',
                to_status: 'RETURNED',
                actor_id: 'editor-1',
            }),
        });
        expect(tx.certification_applications.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'under_review' }),
        }));
    });

    it('keeps approval valid for a non-material contact-only edit', async () => {
        const { service, tx } = createHarness('APPROVED');
        await service.update(
            'application-1',
            {
                ...baseDto,
                contact_name: 'New Contact',
            } as any,
            'editor-1',
        );

        expect(tx.application_reviews.update).not.toHaveBeenCalled();
        expect(tx.application_review_actions.create).not.toHaveBeenCalled();
        expect(tx.certification_applications.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: 'accepted' }),
        }));
    });

    it('blocks application edits while the one reviewer is processing a SUBMITTED review', async () => {
        const { service } = createHarness('SUBMITTED');
        await expect(service.update(
            'application-1',
            baseDto as any,
            'editor-1',
        )).rejects.toBeInstanceOf(BadRequestException);
    });
});
