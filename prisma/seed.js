require('dotenv/config');

const { PrismaMssql } = require('@prisma/adapter-mssql');
const { PrismaClient } = require('@prisma/client');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('Thiếu biến môi trường DATABASE_URL');
}

const prisma = new PrismaClient({
    adapter: new PrismaMssql(databaseUrl),
});

const permissions = [
    'applications.manage',
    'applications.read',
    'applications.review',
    'audit_logs.read',
    'audit_plans.manage',
    'audit_plans.read',
    'audit_programs.manage',
    'audit_programs.read',
    'audit_teams.manage',
    'audit_teams.read',
    'certificates.manage',
    'certificates.read',
    'certification_decisions.issue',
    'certification_decisions.read',
    'classifications.manage',
    'classifications.read',
    'competencies.manage',
    'competencies.read',
    'contracts.manage',
    'contracts.read',
    'customer_portal.access',
    'customers.manage',
    'customers.read',
    'dashboard.read',
    'documents.manage',
    'documents.read',
    'experts.manage',
    'experts.read',
    'findings.manage',
    'findings.read',
    'mandays.approve',
    'mandays.manage',
    'mandays.read',
    'notifications.manage',
    'notifications.read',
    'projects.manage',
    'projects.read',
    'reports.manage',
    'technical_reviews.perform',
    'technical_reviews.read',
    'users.manage',
    'users.read',
];

const roleDefinitions = {
    admin: {
        description: 'Quản trị toàn bộ hệ thống',
        permissions,
    },
    auditor: {
        description: 'Chuyên gia đánh giá',
        permissions: [
            'audit_plans.read',
            'audit_programs.read',
            'audit_teams.read',
            'dashboard.read',
            'documents.manage',
            'documents.read',
            'findings.manage',
            'findings.read',
            'notifications.read',
            'projects.read',
            'reports.manage',
        ],
    },
    coordinator: {
        description: 'Điều phối chứng nhận và đánh giá',
        permissions: [
            'applications.read',
            'applications.review',
            'audit_plans.manage',
            'audit_plans.read',
            'audit_programs.manage',
            'audit_programs.read',
            'audit_teams.manage',
            'audit_teams.read',
            'classifications.read',
            'competencies.read',
            'contracts.read',
            'customers.read',
            'dashboard.read',
            'documents.manage',
            'documents.read',
            'experts.read',
            'mandays.manage',
            'mandays.read',
            'notifications.manage',
            'notifications.read',
            'projects.manage',
            'projects.read',
        ],
    },
    customer: {
        description: 'Khách hàng sử dụng cổng thông tin',
        permissions: [
            'customer_portal.access',
        ],
    },
    decision_maker: {
        description: 'Người ra quyết định chứng nhận',
        permissions: [
            'certificates.manage',
            'certificates.read',
            'certification_decisions.issue',
            'certification_decisions.read',
            'customers.read',
            'dashboard.read',
            'documents.read',
            'findings.read',
            'notifications.manage',
            'notifications.read',
            'projects.read',
            'technical_reviews.read',
        ],
    },
    lead_auditor: {
        description: 'Trưởng đoàn đánh giá',
        permissions: [
            'audit_plans.read',
            'audit_programs.read',
            'audit_teams.read',
            'competencies.read',
            'customers.read',
            'dashboard.read',
            'documents.manage',
            'documents.read',
            'experts.read',
            'findings.manage',
            'findings.read',
            'notifications.read',
            'projects.read',
            'reports.manage',
        ],
    },
    sales: {
        description: 'Kinh doanh và CRM',
        permissions: [
            'applications.manage',
            'applications.read',
            'certificates.read',
            'contracts.manage',
            'contracts.read',
            'customers.manage',
            'customers.read',
            'dashboard.read',
            'documents.manage',
            'documents.read',
            'notifications.read',
            'projects.read',
        ],
    },
    staff: {
        description: 'Nhân viên nghiệp vụ chứng nhận',
        permissions: [
            'applications.manage',
            'applications.read',
            'audit_plans.read',
            'audit_programs.read',
            'audit_teams.read',
            'certificates.read',
            'contracts.manage',
            'contracts.read',
            'customers.manage',
            'customers.read',
            'dashboard.read',
            'documents.manage',
            'documents.read',
            'mandays.read',
            'notifications.read',
            'projects.manage',
            'projects.read',
            'reports.manage',
        ],
    },
    technical_reviewer: {
        description: 'Chuyên gia thẩm xét kỹ thuật',
        permissions: [
            'applications.read',
            'audit_plans.read',
            'audit_programs.read',
            'audit_teams.read',
            'certification_decisions.read',
            'classifications.read',
            'competencies.read',
            'customers.read',
            'dashboard.read',
            'documents.read',
            'experts.read',
            'findings.read',
            'mandays.read',
            'notifications.read',
            'projects.read',
            'technical_reviews.perform',
            'technical_reviews.read',
        ],
    },
};

async function main() {
    const permissionRecords = new Map();

    for (const permissionName of permissions) {
        const permission = await prisma.permissions.upsert({
            where: {
                permission_name: permissionName,
            },
            update: {},
            create: {
                permission_name: permissionName,
            },
        });

        permissionRecords.set(permissionName, permission);
    }

    for (const [roleName, definition] of Object.entries(roleDefinitions)) {
        const role = await prisma.roles.upsert({
            where: {
                role_name: roleName,
            },
            update: {
                description: definition.description,
            },
            create: {
                role_name: roleName,
                description: definition.description,
            },
        });

        for (const permissionName of definition.permissions) {
            const permission = permissionRecords.get(permissionName);

            if (!permission) {
                throw new Error(`Không tìm thấy permission ${permissionName}`);
            }

            await prisma.role_permissions.upsert({
                where: {
                    role_id_permission_id: {
                        role_id: role.id,
                        permission_id: permission.id,
                    },
                },
                update: {},
                create: {
                    role_id: role.id,
                    permission_id: permission.id,
                },
            });
        }
    }

    console.log(
        `Đã đồng bộ ${permissions.length} permissions và ${Object.keys(roleDefinitions).length} roles.`,
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
