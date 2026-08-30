import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'fs';

import { PrismaService } from '../prisma/prisma.service';
import type { ResourceActor } from '../security/resource-access.service';
import { resolveDocumentStoragePath } from '../common/storage-config';
import { DocumentFilesService } from '../document-files/document-files.service';
import { DocumentControlService } from './document-control.service';
import { RenderControlledTemplateDto } from './dto/document-control.dto';
import { TEMPLATE_ALLOWED_TOKENS, TEMPLATE_FIELD_CATALOG } from './template-field-catalog';

// Existing project runtime: small OOXML engine preserves Word layout and supports {{field}}
// plus repeat-row markers such as {{#audit_team}} ... {{/audit_team}}.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { listTemplateTokens, renderDocxTemplate, renderXlsxTemplate } = require('../reports/runtime/ooxml-template-engine.cjs') as {
    listTemplateTokens: (templatePath: string) => string[];
    renderDocxTemplate: (input: { templatePath: string; outputPath: string; data: Record<string, unknown> }) => string;
    renderXlsxTemplate: (input: { templatePath: string; outputPath: string; data: Record<string, unknown> }) => string;
};

@Injectable()
export class TemplateManagerService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly documentFiles: DocumentFilesService,
        private readonly documentControl: DocumentControlService,
    ) {}

    fieldCatalog() {
        const groups = new Map<string, typeof TEMPLATE_FIELD_CATALOG>();
        for (const field of TEMPLATE_FIELD_CATALOG) {
            const current = groups.get(field.group) ?? [];
            current.push(field);
            groups.set(field.group, current);
        }
        return {
            syntax: {
                scalar: '{{customer.name}}',
                repeat_row: '{{#audit_team}} ... {{full_name}} ... {{/audit_team}}',
                note: 'Đặt placeholder trực tiếp trong Word/Excel. Word hỗ trợ cả dòng lặp; Excel hiện hỗ trợ placeholder đơn. Không đổi style giữa các ký tự của cùng placeholder.',
            },
            total: TEMPLATE_FIELD_CATALOG.length,
            groups: Array.from(groups.entries()).map(([group, fields]) => ({ group, fields })),
        };
    }

    private templatePath(storedName: string) {
        const path = resolveDocumentStoragePath(storedName);
        if (!existsSync(path)) throw new NotFoundException('Không tìm thấy tệp nguồn của biểu mẫu');
        return path;
    }

    async validateTemplateVersion(id: string) {
        const version = await this.prisma.controlled_template_versions.findUnique({
            where: { id },
            include: { series: true, source_file: true },
        });
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản biểu mẫu');
        if (!version.source_file) throw new ConflictException('Phiên bản chưa có tệp Word/Excel nguồn');
        const sourceName = version.source_file.original_name.toLowerCase();
        const isDocx = sourceName.endsWith('.docx');
        const isXlsx = sourceName.endsWith('.xlsx');
        if (!isDocx && !isXlsx) {
            throw new BadRequestException('Template Manager chỉ hỗ trợ Word .docx hoặc Excel .xlsx');
        }
        const tokens = listTemplateTokens(this.templatePath(version.source_file.stored_name));
        const unknown = tokens.filter((token) => !TEMPLATE_ALLOWED_TOKENS.has(token));
        const unsupportedRepeat = isXlsx
            ? tokens.filter((token) => token.startsWith('#') || token.startsWith('/'))
            : [];
        const result = {
            valid: unknown.length === 0 && unsupportedRepeat.length === 0,
            format: isXlsx ? 'XLSX' : 'DOCX',
            token_count: tokens.length,
            tokens,
            unknown_tokens: unknown,
            unsupported_repeat_tokens: unsupportedRepeat,
            checked_at: new Date().toISOString(),
        };
        await this.prisma.controlled_template_versions.update({
            where: { id },
            data: {
                token_snapshot_json: JSON.stringify(tokens),
                validation_json: JSON.stringify(result),
                validated_at: new Date(),
            },
        });
        return result;
    }

    private formatDate(value?: Date | null) {
        if (!value) return '';
        const day = String(value.getDate()).padStart(2, '0');
        const month = String(value.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${value.getFullYear()}`;
    }

    private merge<T extends Record<string, unknown>>(base: T, override?: Record<string, unknown>): T {
        if (!override) return base;
        const result: Record<string, unknown> = { ...base };
        for (const [key, value] of Object.entries(override)) {
            if (
                value && typeof value === 'object' && !Array.isArray(value) &&
                result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
            ) {
                result[key] = this.merge(result[key] as Record<string, unknown>, value as Record<string, unknown>);
            } else {
                result[key] = value;
            }
        }
        return result as T;
    }

    private async organizationData() {
        const organization = await this.prisma.organization_profiles.findUnique({ where: { profile_key: 'PRIMARY' } });
        return {
            legal_name: organization?.legal_name ?? '',
            display_name: organization?.display_name ?? '',
            short_name: organization?.short_name ?? '',
            address: organization?.address ?? '',
            email: organization?.email ?? '',
            phone: organization?.phone ?? '',
            website: organization?.website ?? '',
        };
    }

    private customerData(customer: {
        customer_code: string; company_name: string; tax_code?: string | null; address?: string | null;
        email?: string | null; phone?: string | null;
    }) {
        return {
            code: customer.customer_code,
            name: customer.company_name,
            tax_code: customer.tax_code ?? '',
            address: customer.address ?? '',
            email: customer.email ?? '',
            phone: customer.phone ?? '',
        };
    }

    private applicationData(application: {
        application_code: string; application_date: Date; certification_scope: string; standard_name: string;
        site_count: number; total_employee_count?: number | null; employee_count?: number | null;
    }) {
        return {
            code: application.application_code,
            date: this.formatDate(application.application_date),
            scope: application.certification_scope,
            standard_name: application.standard_name,
            site_count: application.site_count,
            employee_count: application.total_employee_count ?? application.employee_count ?? '',
        };
    }

    private sitesData(sites: Array<{
        site_no: number; site_name?: string | null; address: string; activities?: string | null; employee_count?: number | null;
    }>) {
        return sites.map((site) => ({
            site_no: site.site_no,
            site_name: site.site_name ?? '',
            address: site.address,
            activities: site.activities ?? '',
            employee_count: site.employee_count ?? '',
        }));
    }

    private async auditData(auditPlanId?: string | null) {
        if (!auditPlanId) return { audit: {}, audit_team: [] as Array<Record<string, unknown>> };
        const plan = await this.prisma.audit_plans.findUnique({
            where: { id: auditPlanId },
            include: {
                audit_team_appointment: {
                    include: {
                        members: { include: { experts: true } },
                    },
                },
            },
        });
        if (!plan) return { audit: {}, audit_team: [] as Array<Record<string, unknown>> };
        const team = (plan.audit_team_appointment?.members ?? []).map((member) => ({
            full_name: member.experts.full_name,
            role: member.team_role,
            mandays: member.planned_mandays?.toString() ?? '',
        }));
        return {
            audit: {
                plan_code: plan.plan_code ?? '',
                type: plan.audit_type ?? '',
                start_date: this.formatDate(plan.planned_start_date),
                end_date: this.formatDate(plan.planned_end_date),
                scope: plan.audit_scope ?? '',
                location: plan.location ?? '',
            },
            audit_team: team,
        };
    }

    private certificateData(certificate?: {
        cert_number: string; issue_date?: Date | null; expire_date?: Date | null; certification_scope: string;
        standard_name: string; organization_name: string;
    } | null) {
        return certificate ? {
            number: certificate.cert_number,
            issue_date: this.formatDate(certificate.issue_date),
            expiry_date: this.formatDate(certificate.expire_date),
            scope: certificate.certification_scope,
            standard_name: certificate.standard_name,
            organization_name: certificate.organization_name,
        } : {};
    }

    private async resolveContext(dto: RenderControlledTemplateDto) {
        const organization = await this.organizationData();
        const type = dto.context_type;
        if (type === 'CUSTOMER') {
            const customer = await this.prisma.customers.findUnique({ where: { id: dto.entity_id } });
            if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
            return {
                entity_type: 'customer', entity_id: customer.id, project_id: null, customer_id: customer.id,
                data: { organization, customer: this.customerData(customer), application: {}, project: {}, audit: {}, certificate: {}, sites: [], audit_team: [] },
            };
        }
        if (type === 'APPLICATION') {
            const application = await this.prisma.certification_applications.findUnique({
                where: { id: dto.entity_id }, include: { customers: true, sites: { orderBy: { site_no: 'asc' } } },
            });
            if (!application) throw new NotFoundException('Không tìm thấy đơn đăng ký');
            return {
                entity_type: 'certification_application', entity_id: application.id, project_id: null, customer_id: application.customer_id,
                data: { organization, customer: this.customerData(application.customers), application: this.applicationData(application), project: {}, audit: {}, certificate: {}, sites: this.sitesData(application.sites), audit_team: [] },
            };
        }
        if (type === 'PROJECT') {
            const project = await this.prisma.certification_projects.findUnique({
                where: { id: dto.entity_id },
                include: { certification_applications: { include: { customers: true, sites: { orderBy: { site_no: 'asc' } } } } },
            });
            if (!project) throw new NotFoundException('Không tìm thấy hồ sơ chứng nhận');
            const latestPlan = await this.prisma.audit_plans.findFirst({ where: { project_id: project.id }, orderBy: [{ planned_start_date: 'desc' }, { created_at: 'desc' }] });
            const audit = await this.auditData(latestPlan?.id);
            const latestCertificate = await this.prisma.certificates.findFirst({
                where: { certificate_series: { project_id: project.id } }, orderBy: { version_no: 'desc' },
            });
            const application = project.certification_applications;
            return {
                entity_type: 'certification_project', entity_id: project.id, project_id: project.id, customer_id: application.customer_id,
                data: {
                    organization,
                    customer: this.customerData(application.customers),
                    application: this.applicationData(application),
                    project: { code: project.project_code, standard_name: project.standard_name ?? application.standard_name, status: project.status ?? '' },
                    ...audit,
                    certificate: this.certificateData(latestCertificate),
                    sites: this.sitesData(application.sites),
                },
            };
        }
        if (type === 'AUDIT_PLAN') {
            const plan = await this.prisma.audit_plans.findUnique({
                where: { id: dto.entity_id },
                include: { certification_projects: { include: { certification_applications: { include: { customers: true, sites: { orderBy: { site_no: 'asc' } } } } } } },
            });
            if (!plan) throw new NotFoundException('Không tìm thấy kế hoạch đánh giá');
            const project = plan.certification_projects;
            const application = project.certification_applications;
            const audit = await this.auditData(plan.id);
            return {
                entity_type: 'audit_plan', entity_id: plan.id, project_id: project.id, customer_id: application.customer_id,
                data: {
                    organization, customer: this.customerData(application.customers), application: this.applicationData(application),
                    project: { code: project.project_code, standard_name: project.standard_name ?? application.standard_name, status: project.status ?? '' },
                    ...audit, certificate: {}, sites: this.sitesData(application.sites),
                },
            };
        }
        const certificate = await this.prisma.certificates.findUnique({
            where: { id: dto.entity_id },
            include: { certificate_series: { include: { certification_project: { include: { certification_applications: { include: { customers: true, sites: { orderBy: { site_no: 'asc' } } } } } } } } },
        });
        if (!certificate) throw new NotFoundException('Không tìm thấy chứng chỉ');
        const project = certificate.certificate_series.certification_project;
        const application = project.certification_applications;
        return {
            entity_type: 'certificate', entity_id: certificate.id, project_id: project.id, customer_id: application.customer_id,
            data: {
                organization, customer: this.customerData(application.customers), application: this.applicationData(application),
                project: { code: project.project_code, standard_name: project.standard_name ?? application.standard_name, status: project.status ?? '' },
                audit: {}, audit_team: [], certificate: this.certificateData(certificate), sites: this.sitesData(application.sites),
            },
        };
    }

    async searchContexts(typeInput: string, search?: string) {
        const type = typeInput.trim().toUpperCase();
        const keyword = search?.trim() || undefined;
        if (type === 'CUSTOMER') {
            const rows = await this.prisma.customers.findMany({
                where: keyword ? { OR: [
                    { customer_code: { contains: keyword } },
                    { company_name: { contains: keyword } },
                    { tax_code: { contains: keyword } },
                ] } : undefined,
                orderBy: { company_name: 'asc' }, take: 30,
            });
            return rows.map((row) => ({ id: row.id, label: `${row.customer_code} · ${row.company_name}`, description: row.tax_code ?? row.address ?? '' }));
        }
        if (type === 'APPLICATION') {
            const rows = await this.prisma.certification_applications.findMany({
                where: keyword ? { OR: [
                    { application_code: { contains: keyword } },
                    { standard_name: { contains: keyword } },
                    { customers: { company_name: { contains: keyword } } },
                ] } : undefined,
                include: { customers: true }, orderBy: { created_at: 'desc' }, take: 30,
            });
            return rows.map((row) => ({ id: row.id, label: `${row.application_code} · ${row.customers.company_name}`, description: row.standard_name }));
        }
        if (type === 'PROJECT') {
            const rows = await this.prisma.certification_projects.findMany({
                where: keyword ? { OR: [
                    { project_code: { contains: keyword } },
                    { standard_name: { contains: keyword } },
                    { certification_applications: { customers: { company_name: { contains: keyword } } } },
                ] } : undefined,
                include: { certification_applications: { include: { customers: true } } }, orderBy: { created_at: 'desc' }, take: 30,
            });
            return rows.map((row) => ({ id: row.id, label: `${row.project_code} · ${row.certification_applications.customers.company_name}`, description: row.standard_name ?? row.certification_applications.standard_name }));
        }
        if (type === 'AUDIT_PLAN') {
            const rows = await this.prisma.audit_plans.findMany({
                where: keyword ? { OR: [
                    { plan_code: { contains: keyword } },
                    { audit_type: { contains: keyword } },
                    { certification_projects: { project_code: { contains: keyword } } },
                ] } : undefined,
                include: { certification_projects: { include: { certification_applications: { include: { customers: true } } } } },
                orderBy: { created_at: 'desc' }, take: 30,
            });
            return rows.map((row) => ({ id: row.id, label: `${row.plan_code ?? 'Kế hoạch'} · ${row.certification_projects.certification_applications.customers.company_name}`, description: `${row.audit_type ?? ''} · ${row.certification_projects.project_code}` }));
        }
        if (type === 'CERTIFICATE') {
            const rows = await this.prisma.certificates.findMany({
                where: keyword ? { OR: [
                    { cert_number: { contains: keyword } },
                    { organization_name: { contains: keyword } },
                    { standard_name: { contains: keyword } },
                ] } : undefined,
                orderBy: { created_at: 'desc' }, take: 30,
            });
            return rows.map((row) => ({ id: row.id, label: `${row.cert_number} · ${row.organization_name}`, description: row.standard_name }));
        }
        throw new BadRequestException('Loại dữ liệu nguồn không hợp lệ');
    }

    async previewData(dto: RenderControlledTemplateDto) {
        const context = await this.resolveContext(dto);
        return {
            context: { type: dto.context_type, entity_id: dto.entity_id },
            data: this.merge(context.data as Record<string, unknown>, dto.data_overrides),
        };
    }

    async render(versionId: string, dto: RenderControlledTemplateDto, actor: ResourceActor) {
        const version = await this.prisma.controlled_template_versions.findUnique({
            where: { id: versionId }, include: { series: true, source_file: true },
        });
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản biểu mẫu');
        if (version.status !== 'EFFECTIVE') throw new ConflictException('Chỉ biểu mẫu đang hiệu lực mới được sinh hồ sơ');
        if (!version.source_file) throw new ConflictException('Biểu mẫu chưa có file Word/Excel nguồn');
        const validation = await this.validateTemplateVersion(versionId);
        if (!validation.valid) {
            throw new ConflictException(`Biểu mẫu còn placeholder chưa được hỗ trợ: ${validation.unknown_tokens.join(', ')}`);
        }
        const context = await this.resolveContext(dto);
        const data = this.merge(context.data as Record<string, unknown>, dto.data_overrides);
        const created = await this.documentControl.createDocument({
            document_code: dto.document_code?.trim() || version.series.template_code,
            document_name: dto.document_name?.trim() || version.series.template_name,
            document_type: version.series.document_type,
            entity_type: context.entity_type,
            entity_id: context.entity_id,
            project_id: context.project_id ?? undefined,
            customer_id: context.customer_id ?? undefined,
            template_version_id: version.id,
            number_prefix: dto.number_prefix?.trim() || version.series.template_code,
            change_note: `Sinh tự động từ ${version.series.template_code} ${version.revision_label}`,
        }, actor);
        const documentVersion = created.versions[0];
        const sourceName = version.source_file.original_name.toLowerCase();
        const isExcel = sourceName.endsWith('.xlsx');
        const extension = isExcel ? '.xlsx' : '.docx';
        const storedName = `${randomUUID()}${extension}`;
        const outputPath = resolveDocumentStoragePath(storedName);
        try {
            if (isExcel) {
                renderXlsxTemplate({
                    templatePath: this.templatePath(version.source_file.stored_name),
                    outputPath,
                    data,
                });
            } else {
                renderDocxTemplate({
                    templatePath: this.templatePath(version.source_file.stored_name),
                    outputPath,
                    data,
                });
            }
            const generatedFile = await this.documentFiles.registerGenerated({
                entity_type: context.entity_type,
                entity_id: context.entity_id,
                document_type: version.series.document_type,
                file_kind: isExcel ? 'generated_xlsx' : 'generated_docx',
                original_name: `${created.document_number}-${version.series.template_code}${extension}`,
                stored_name: storedName,
                absolute_path: outputPath,
                mime_type: isExcel
                    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                note: `Sinh từ ${version.series.template_code} ${version.revision_label}`,
                uploaded_by: actor.userId ?? null,
            });
            await this.prisma.controlled_document_versions.update({
                where: { id: documentVersion.id },
                data: {
                    source_snapshot_json: JSON.stringify(data),
                    generation_context_json: JSON.stringify({
                        context_type: dto.context_type,
                        entity_id: dto.entity_id,
                        template_version_id: version.id,
                        template_code: version.series.template_code,
                        template_revision: version.revision_label,
                    }),
                },
            });
            await this.documentControl.attachWorkingFile(documentVersion.id, generatedFile.id, actor);
            return this.documentControl.findDocument(created.id, actor);
        } catch (error) {
            if (existsSync(outputPath)) unlinkSync(outputPath);
            throw error;
        }
    }
}
