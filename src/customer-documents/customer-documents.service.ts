import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'fs';

import { PrismaService } from '../prisma/prisma.service';
import { ResourceAccessService } from '../security/resource-access.service';
import type { ResourceActor } from '../security/resource-access.service';
import { WorkItemsService } from '../work-items/work-items.service';
import { WORK_ITEM_ACTIONS } from '../work-items/work-item.constants';
import { resolveDocumentStoragePath } from '../common/storage-config';
import {
    promoteValidatedUpload,
    validateUploadedFile,
    verifyStoredFileIntegrity,
} from '../common/upload-security';
import { calculateFileSha256 } from '../common/file-integrity';
import type { CreateCustomerDocumentRequestDto } from './dto/create-customer-document-request.dto';
import type { ReviewCustomerDocumentRequestDto } from './dto/review-customer-document-request.dto';
import type { SubmitCustomerDocumentResponseDto } from './dto/submit-customer-document-response.dto';
import type { UploadCustomerApplicationDocumentDto } from './dto/upload-customer-application-document.dto';
import type { UploadCustomerDocumentResponseDto } from './dto/upload-customer-document-response.dto';

@Injectable()
export class CustomerDocumentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly resourceAccess: ResourceAccessService,
        private readonly workItems: WorkItemsService,
    ) {}

    private normalize(value?: string | null) {
        return (value ?? '').trim().toLowerCase();
    }

    private actorUserId(actor: ResourceActor) {
        const userId = actor.userId?.trim();
        if (!userId) {
            throw new ForbiddenException('Không xác định được tài khoản đang đăng nhập');
        }
        return userId;
    }

    private requestCode() {
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
        return `DOCREQ-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`;
    }

    private applicationDocumentType(category: string) {
        return `customer_application_${category.trim().toLowerCase()}`;
    }

    private async customerIds(actor: ResourceActor) {
        const ids = Array.from(await this.resourceAccess.getAccessibleCustomerIds(actor));
        if (!ids.length) {
            throw new ForbiddenException('Tài khoản chưa được gán cho tổ chức khách hàng đang hoạt động');
        }
        return ids;
    }

    private async assertCustomerApplication(applicationId: string, actor: ResourceActor) {
        const customerIds = await this.customerIds(actor);
        const application = await this.prisma.certification_applications.findFirst({
            where: {
                id: applicationId,
                customer_id: { in: customerIds },
            },
            select: {
                id: true,
                customer_id: true,
                application_code: true,
                status: true,
                customers: {
                    select: {
                        customer_code: true,
                        company_name: true,
                    },
                },
            },
        });
        if (!application) {
            throw new ForbiddenException('Bạn không có quyền truy cập đơn đăng ký này');
        }
        if (['rejected', 'cancelled'].includes(this.normalize(application.status))) {
            throw new ConflictException('Đơn đăng ký đã kết thúc và không nhận thêm tài liệu');
        }
        return application;
    }

    private async assertCustomerRequest(requestId: string, actor: ResourceActor) {
        const customerIds = await this.customerIds(actor);
        const request = await this.prisma.customer_document_requests.findFirst({
            where: {
                id: requestId,
                customer_id: { in: customerIds },
            },
            select: {
                id: true,
                request_code: true,
                customer_id: true,
                application_id: true,
                status: true,
                due_date: true,
            },
        });
        if (!request) {
            throw new ForbiddenException('Bạn không có quyền truy cập yêu cầu tài liệu này');
        }
        return request;
    }

    private removePhysicalFile(path: string) {
        try {
            if (existsSync(path)) unlinkSync(path);
        } catch {
            // best-effort cleanup; original exception remains authoritative
        }
    }

    private async createVersionedDocument(input: {
        entityType: string;
        entityId: string;
        documentType: string;
        file: Express.Multer.File;
        uploadedBy: string;
        note?: string;
    }) {
        if (!input.file) throw new BadRequestException('Chưa chọn file tải lên');
        const validated = validateUploadedFile(input.file, 'attachment');
        const promoted = promoteValidatedUpload(input.file, validated.extension);

        try {
            const document = await this.prisma.$transaction(async (tx) => {
                const latest = await tx.documentFile.aggregate({
                    where: {
                        entity_type: input.entityType,
                        entity_id: input.entityId,
                        document_type: input.documentType,
                        file_kind: 'attachment',
                    },
                    _max: { version_no: true },
                });
                const version = (latest._max.version_no ?? 0) + 1;
                await tx.documentFile.updateMany({
                    where: {
                        entity_type: input.entityType,
                        entity_id: input.entityId,
                        document_type: input.documentType,
                        file_kind: 'attachment',
                        is_current: true,
                    },
                    data: { is_current: false },
                });
                return tx.documentFile.create({
                    data: {
                        entity_type: input.entityType,
                        entity_id: input.entityId,
                        document_type: input.documentType,
                        file_kind: 'attachment',
                        original_name: validated.originalName,
                        stored_name: promoted.storedName,
                        file_url: `/uploads/documents/${promoted.storedName}`,
                        mime_type: validated.mimeType,
                        file_size: validated.fileSize,
                        sha256: validated.sha256,
                        version_no: version,
                        is_current: true,
                        note: input.note?.trim() || null,
                        uploaded_by: input.uploadedBy,
                    },
                });
            });
            return {
                ...document,
                download_url: `/customer-portal/me/documents/files/${document.id}/download`,
            };
        } catch (error) {
            this.removePhysicalFile(promoted.absolutePath);
            throw error;
        }
    }

    async uploadApplicationDocument(
        applicationId: string,
        dto: UploadCustomerApplicationDocumentDto,
        file: Express.Multer.File,
        actor: ResourceActor,
    ) {
        const application = await this.assertCustomerApplication(applicationId, actor);
        const userId = this.actorUserId(actor);
        return this.createVersionedDocument({
            entityType: 'certification_application',
            entityId: application.id,
            documentType: this.applicationDocumentType(dto.category),
            file,
            uploadedBy: userId,
            note: dto.note,
        });
    }

    async uploadDocumentRequestResponse(
        requestId: string,
        dto: UploadCustomerDocumentResponseDto,
        file: Express.Multer.File,
        actor: ResourceActor,
    ) {
        const request = await this.assertCustomerRequest(requestId, actor);
        if (!['REQUESTED', 'REVISION_REQUIRED'].includes(request.status)) {
            throw new ConflictException('Yêu cầu tài liệu hiện không ở trạng thái nhận phản hồi');
        }
        return this.createVersionedDocument({
            entityType: 'customer_document_request',
            entityId: request.id,
            documentType: 'requested_evidence',
            file,
            uploadedBy: this.actorUserId(actor),
            note: dto.note,
        });
    }

    private async portalDocumentRows(customerIds: string[]) {
        const applications = await this.prisma.certification_applications.findMany({
            where: { customer_id: { in: customerIds } },
            select: {
                id: true,
                application_code: true,
                customer_id: true,
                standard_name: true,
                status: true,
                customers: { select: { customer_code: true, company_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        const applicationIds = applications.map((item) => item.id);
        const [applicationDocuments, requests] = await Promise.all([
            this.prisma.documentFile.findMany({
                    where: {
                        entity_type: 'certification_application',
                        entity_id: { in: applicationIds },
                        document_type: { startsWith: 'customer_application_' },
                        file_kind: 'attachment',
                    },
                    select: {
                        id: true,
                        entity_id: true,
                        document_type: true,
                        original_name: true,
                        mime_type: true,
                        file_size: true,
                        version_no: true,
                        is_current: true,
                        note: true,
                        created_at: true,
                    },
                    orderBy: [{ created_at: 'desc' }, { version_no: 'desc' }],
                }),
            this.prisma.customer_document_requests.findMany({
                where: { customer_id: { in: customerIds } },
                select: {
                    id: true,
                    request_code: true,
                    customer_id: true,
                    application_id: true,
                    category: true,
                    title: true,
                    description: true,
                    due_date: true,
                    status: true,
                    response_note: true,
                    submitted_at: true,
                    review_comment: true,
                    reviewed_at: true,
                    created_at: true,
                    application: {
                        select: { application_code: true, standard_name: true },
                    },
                },
                orderBy: { created_at: 'desc' },
            }),
        ]);
        const requestIds = requests.map((item) => item.id);
        const responseDocuments = await this.prisma.documentFile.findMany({
                where: {
                    entity_type: 'customer_document_request',
                    entity_id: { in: requestIds },
                    document_type: 'requested_evidence',
                    file_kind: 'attachment',
                },
                select: {
                    id: true,
                    entity_id: true,
                    original_name: true,
                    mime_type: true,
                    file_size: true,
                    version_no: true,
                    is_current: true,
                    note: true,
                    created_at: true,
                },
                orderBy: [{ created_at: 'desc' }, { version_no: 'desc' }],
            });

        return {
            applications: applications.map((application) => ({
                ...application,
                documents: applicationDocuments
                    .filter((doc) => doc.entity_id === application.id)
                    .map((doc) => ({
                        ...doc,
                        category: doc.document_type.replace(/^customer_application_/, '').toUpperCase(),
                        download_url: `/customer-portal/me/documents/files/${doc.id}/download`,
                    })),
            })),
            requests: requests.map((request) => ({
                ...request,
                documents: responseDocuments
                    .filter((doc) => doc.entity_id === request.id)
                    .map((doc) => ({
                        ...doc,
                        download_url: `/customer-portal/me/documents/files/${doc.id}/download`,
                    })),
            })),
        };
    }

    async getPortalDocuments(actor: ResourceActor) {
        return this.portalDocumentRows(await this.customerIds(actor));
    }

    async submitResponse(
        requestId: string,
        dto: SubmitCustomerDocumentResponseDto,
        actor: ResourceActor,
    ) {
        const request = await this.assertCustomerRequest(requestId, actor);
        if (!['REQUESTED', 'REVISION_REQUIRED'].includes(request.status)) {
            throw new ConflictException('Yêu cầu tài liệu không thể gửi phản hồi ở trạng thái hiện tại');
        }
        const currentEvidence = await this.prisma.documentFile.findFirst({
            where: {
                entity_type: 'customer_document_request',
                entity_id: request.id,
                document_type: 'requested_evidence',
                file_kind: 'attachment',
                is_current: true,
            },
            select: { id: true },
        });
        if (!currentEvidence) {
            throw new BadRequestException('Cần tải ít nhất một tài liệu phản hồi trước khi gửi');
        }
        const userId = this.actorUserId(actor);
        return this.prisma.$transaction(async (tx) => {
            const current = await tx.customer_document_requests.findUnique({
                where: { id: request.id },
                select: { id: true, status: true, request_code: true, due_date: true, application_id: true },
            });
            if (!current || !['REQUESTED', 'REVISION_REQUIRED'].includes(current.status)) {
                throw new ConflictException('Yêu cầu tài liệu đã thay đổi trạng thái');
            }
            const updated = await tx.customer_document_requests.update({
                where: { id: current.id },
                data: {
                    status: 'SUBMITTED',
                    response_note: dto.note?.trim() || null,
                    responded_by: userId,
                    submitted_at: new Date(),
                    reviewed_by: null,
                    reviewed_at: null,
                    review_comment: null,
                },
            });
            await this.workItems.openWorkItem({
                sourceKey: `customer-document-request:${current.id}:review`,
                workType: 'CUSTOMER_DOCUMENT_RESPONSE_REVIEW',
                actionCode: WORK_ITEM_ACTIONS.CUSTOMER_DOCUMENT_RESPONSE_REVIEW,
                title: `Xem xét tài liệu phản hồi ${current.request_code}`,
                entityType: 'customer_document_request',
                entityId: current.id,
                assignedRole: 'COORDINATOR',
                priority: 'HIGH',
                dueAt: current.due_date ?? undefined,
                destinationPath: '/customer-document-requests',
                context: { application_id: current.application_id },
            }, tx);
            return updated;
        });
    }

    async createRequest(dto: CreateCustomerDocumentRequestDto, requestedBy: string) {
        const application = await this.prisma.certification_applications.findUnique({
            where: { id: dto.application_id },
            select: {
                id: true,
                customer_id: true,
                application_code: true,
                customers: { select: { customer_code: true, company_name: true } },
            },
        });
        if (!application) throw new NotFoundException('Không tìm thấy đơn đăng ký');

        const created = await this.prisma.customer_document_requests.create({
            data: {
                request_code: this.requestCode(),
                customer_id: application.customer_id,
                application_id: application.id,
                requested_by: requestedBy,
                category: dto.category,
                title: dto.title.trim(),
                description: dto.description?.trim() || null,
                due_date: dto.due_date ? new Date(dto.due_date) : null,
                status: 'REQUESTED',
            },
        });

        const recipients = await this.prisma.customer_user_access.findMany({
            where: {
                customer_id: application.customer_id,
                status: 'active',
                user: { is: { status: 'active' } },
            },
            select: { user_id: true },
        });
        for (const recipient of recipients) {
            await this.prisma.notifications.upsert({
                where: {
                    user_id_source_key_channel: {
                        user_id: recipient.user_id,
                        source_key: `customer-document-request:${created.id}:requested`,
                        channel: 'IN_APP',
                    },
                },
                create: {
                    user_id: recipient.user_id,
                    source_key: `customer-document-request:${created.id}:requested`,
                    notification_type: 'CUSTOMER_DOCUMENT_REQUESTED',
                    category: 'CUSTOMER_DOCUMENT_REQUEST',
                    title: 'Có yêu cầu bổ sung tài liệu',
                    message: `${created.request_code} · ${dto.title.trim()} · Đơn ${application.application_code}`,
                    severity: 'WARNING',
                    entity_type: 'customer_document_request',
                    entity_id: created.id,
                    due_date: created.due_date,
                    destination_path: '/customer-portal/documents',
                },
                update: {
                    title: 'Có yêu cầu bổ sung tài liệu',
                    message: `${created.request_code} · ${dto.title.trim()} · Đơn ${application.application_code}`,
                    severity: 'WARNING',
                    status: 'unread',
                    read_at: null,
                    due_date: created.due_date,
                    destination_path: '/customer-portal/documents',
                },
            });
        }
        return created;
    }

    async getReviewQueue(status?: string) {
        const normalized = status?.trim().toUpperCase();
        const allowed = ['REQUESTED', 'SUBMITTED', 'REVISION_REQUIRED', 'ACCEPTED', 'CANCELLED'];
        if (normalized && !allowed.includes(normalized)) {
            throw new BadRequestException('Trạng thái yêu cầu tài liệu không hợp lệ');
        }
        const items = await this.prisma.customer_document_requests.findMany({
            where: { status: normalized || undefined },
            select: {
                id: true,
                request_code: true,
                customer_id: true,
                application_id: true,
                category: true,
                title: true,
                description: true,
                due_date: true,
                status: true,
                response_note: true,
                submitted_at: true,
                review_comment: true,
                reviewed_at: true,
                created_at: true,
                customer: { select: { customer_code: true, company_name: true } },
                application: { select: { application_code: true, standard_name: true } },
                responder: { select: { id: true, full_name: true, email: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        const ids = items.map((item) => item.id);
        const docs = ids.length
            ? await this.prisma.documentFile.findMany({
                where: {
                    entity_type: 'customer_document_request',
                    entity_id: { in: ids },
                    document_type: 'requested_evidence',
                    file_kind: 'attachment',
                },
                select: {
                    id: true,
                    entity_id: true,
                    original_name: true,
                    mime_type: true,
                    file_size: true,
                    version_no: true,
                    is_current: true,
                    note: true,
                    created_at: true,
                },
                orderBy: [{ created_at: 'desc' }, { version_no: 'desc' }],
            })
            : [];
        return items.map((item) => ({
            ...item,
            documents: docs
                .filter((doc) => doc.entity_id === item.id)
                .map((doc) => ({ ...doc, download_url: `/customer-document-requests/files/${doc.id}/download` })),
        }));
    }

    async reviewRequest(
        requestId: string,
        dto: ReviewCustomerDocumentRequestDto,
        reviewerId: string,
    ) {
        const decision = dto.decision.toUpperCase();
        const comment = dto.comment?.trim() || null;
        if (decision === 'REVISION_REQUIRED' && !comment) {
            throw new BadRequestException('Cần nhập nội dung yêu cầu bổ sung/chỉnh sửa');
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const current = await tx.customer_document_requests.findUnique({
                where: { id: requestId },
                select: {
                    id: true,
                    request_code: true,
                    customer_id: true,
                    status: true,
                },
            });
            if (!current) throw new NotFoundException('Không tìm thấy yêu cầu tài liệu');
            if (current.status !== 'SUBMITTED') {
                throw new ConflictException('Chỉ được xem xét phản hồi tài liệu đã được khách hàng gửi');
            }
            const updated = await tx.customer_document_requests.update({
                where: { id: current.id },
                data: {
                    status: decision === 'ACCEPT' ? 'ACCEPTED' : 'REVISION_REQUIRED',
                    reviewed_by: reviewerId,
                    reviewed_at: new Date(),
                    review_comment: comment,
                },
            });
            await this.workItems.completeWorkItem(
                { sourceKey: `customer-document-request:${current.id}:review` },
                reviewerId,
                tx,
            );
            return { updated, customerId: current.customer_id, accepted: decision === 'ACCEPT' };
        });

        const recipients = await this.prisma.customer_user_access.findMany({
            where: {
                customer_id: result.customerId,
                status: 'active',
                user: { is: { status: 'active' } },
            },
            select: { user_id: true },
        });
        for (const recipient of recipients) {
            const state = result.accepted ? 'accepted' : 'revision';
            await this.prisma.notifications.upsert({
                where: {
                    user_id_source_key_channel: {
                        user_id: recipient.user_id,
                        source_key: `customer-document-request:${requestId}:${state}`,
                        channel: 'IN_APP',
                    },
                },
                create: {
                    user_id: recipient.user_id,
                    source_key: `customer-document-request:${requestId}:${state}`,
                    notification_type: result.accepted
                        ? 'CUSTOMER_DOCUMENT_ACCEPTED'
                        : 'CUSTOMER_DOCUMENT_REVISION_REQUIRED',
                    category: 'CUSTOMER_DOCUMENT_REQUEST',
                    title: result.accepted ? 'Tài liệu đã được chấp nhận' : 'Tài liệu cần bổ sung/chỉnh sửa',
                    message: result.accepted
                        ? `${result.updated.request_code} đã được xác nhận đầy đủ.`
                        : `${result.updated.request_code} cần bổ sung/chỉnh sửa. Vui lòng xem ý kiến phản hồi.`,
                    severity: result.accepted ? 'INFO' : 'WARNING',
                    entity_type: 'customer_document_request',
                    entity_id: requestId,
                    destination_path: '/customer-portal/documents',
                },
                update: {
                    status: 'unread',
                    read_at: null,
                    severity: result.accepted ? 'INFO' : 'WARNING',
                    destination_path: '/customer-portal/documents',
                },
            });
        }
        return result.updated;
    }

    private async resolveDownload(fileId: string, actor: ResourceActor | null, internal: boolean) {
        const file = await this.prisma.documentFile.findUnique({ where: { id: fileId } });
        if (!file || file.file_kind !== 'attachment') {
            throw new NotFoundException('Không tìm thấy tệp');
        }

        if (file.entity_type === 'certification_application' && file.document_type.startsWith('customer_application_')) {
            if (!internal) await this.assertCustomerApplication(file.entity_id, actor!);
        } else if (file.entity_type === 'customer_document_request' && file.document_type === 'requested_evidence') {
            if (!internal) {
                await this.assertCustomerRequest(file.entity_id, actor!);
            } else {
                const request = await this.prisma.customer_document_requests.findUnique({
                    where: { id: file.entity_id },
                    select: { id: true },
                });
                if (!request) throw new NotFoundException('Không tìm thấy yêu cầu tài liệu');
            }
        } else {
            throw new ForbiddenException('Bạn không có quyền truy cập tệp này');
        }

        let absolutePath: string;
        try {
            absolutePath = resolveDocumentStoragePath(file.stored_name);
        } catch {
            throw new NotFoundException('Không tìm thấy tệp vật lý');
        }
        verifyStoredFileIntegrity(absolutePath, file.file_size, file.sha256);
        let result = file;
        if (!file.sha256) {
            const sha256 = calculateFileSha256(absolutePath);
            result = await this.prisma.documentFile.update({
                where: { id: file.id },
                data: { sha256 },
            });
        }
        return { documentFile: result, absolutePath };
    }

    getPortalDownload(fileId: string, actor: ResourceActor) {
        return this.resolveDownload(fileId, actor, false);
    }

    getInternalDownload(fileId: string) {
        return this.resolveDownload(fileId, null, true);
    }
}
