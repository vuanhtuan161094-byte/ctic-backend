import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Optional } from '@nestjs/common';
import { DocumentFilesService } from '../document-files/document-files.service';
import { getStorageConfig } from '../common/storage-config';
import { convertDocxToPdf } from '../common/document-conversion';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationAgreementDto } from './dto/create-certification-agreement.dto';
import { VerifyF18EvidenceDto } from './dto/verify-f18-evidence.dto';

@Injectable()
export class CertificationAgreementsService {
    constructor(
        private readonly prisma: PrismaService,
        @Optional() private readonly documentFiles?: DocumentFilesService,
    ) { }

    // Lấy danh sách thỏa thuận chứng nhận
    async findAll() {
        return this.prisma.certification_agreements.findMany({
            include: {
                customers: {
                    select: {
                        id: true,
                        customer_code: true,
                        company_name: true,
                        tax_code: true,
                        status: true,
                    },
                },
                contracts: {
                    select: {
                        id: true,
                        contract_number: true,
                        sign_date: true,
                    },
                },
            },
            orderBy: {
                created_at: 'desc',
            },
        });
    }

    // Lấy chi tiết một thỏa thuận chứng nhận
    async findOne(id: string) {
        const agreement =
            await this.prisma.certification_agreements.findUnique({
                where: {
                    id,
                },
                include: {
                    customers: {
                        select: {
                            id: true,
                            customer_code: true,
                            company_name: true,
                            tax_code: true,
                            status: true,
                            address: true,
                        },
                    },
                    contracts: {
                        select: {
                            id: true,
                            contract_number: true,
                            sign_date: true,
                            start_date: true,
                            end_date: true,
                        },
                    },
                },
            });

        if (!agreement) {
            throw new NotFoundException(
                'Không tìm thấy thỏa thuận chứng nhận',
            );
        }

        return agreement;
    }

    // Tạo thỏa thuận chứng nhận
    async create(
        dto: CreateCertificationAgreementDto,
        actorId?: string,
    ) {
        if (!actorId) {
            throw new ForbiddenException('Không xác định được người lập F.18');
        }
        // Kiểm tra khách hàng tồn tại
        const customer =
            await this.prisma.customers.findUnique({
                where: {
                    id: dto.customer_id,
                },
            });

        if (!customer) {
            throw new NotFoundException(
                'Không tìm thấy khách hàng',
            );
        }

        // Không tạo hồ sơ mới cho khách hàng đã ngừng hoạt động
        if (customer.status === 'inactive') {
            throw new BadRequestException(
                'Khách hàng đã ngừng hoạt động',
            );
        }

        // Kiểm tra số thỏa thuận đã tồn tại
        const existingAgreement =
            await this.prisma.certification_agreements.findUnique({
                where: {
                    agreement_number:
                        dto.agreement_number,
                },
            });

        if (existingAgreement) {
            throw new BadRequestException(
                'Số thỏa thuận chứng nhận đã tồn tại',
            );
        }

        // Nếu có contract_id thì kiểm tra hợp đồng
        if (dto.contract_id) {
            const contract =
                await this.prisma.contracts.findUnique({
                    where: {
                        id: dto.contract_id,
                    },
                });

            if (!contract) {
                throw new NotFoundException(
                    'Không tìm thấy hợp đồng',
                );
            }

            // Hợp đồng và thỏa thuận phải cùng một khách hàng
            if (
                contract.customer_id !==
                dto.customer_id
            ) {
                throw new BadRequestException(
                    'Hợp đồng không thuộc khách hàng đã chọn',
                );
            }
        }

        // A F.18 register row is not proof of either party's signature.
        // The separately versioned signed_scan remains the documentary evidence.
        return this.prisma.$transaction(async (tx) => {
            const agreement = await tx.certification_agreements.create({
                data: {
                    customer_id: dto.customer_id,
                    contract_id: dto.contract_id,
                    agreement_number: dto.agreement_number,
                    sign_date: new Date(dto.sign_date),
                },
                include: {
                    customers: {
                        select: {
                            id: true,
                            customer_code: true,
                            company_name: true,
                        },
                    },
                    contracts: {
                        select: {
                            id: true,
                            contract_number: true,
                        },
                    },
                },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actorId,
                    action: 'CREATE_P09_F18_AGREEMENT',
                    entity_type: 'certification_agreement',
                    entity_id: agreement.id,
                    outcome: 'SUCCESS',
                    details_json: JSON.stringify({
                        agreement_number: agreement.agreement_number,
                        customer_id: agreement.customer_id,
                        contract_id: agreement.contract_id,
                        signed_evidence_verified: false,
                    }),
                },
            });
            return agreement;
        });
    }
    async evidenceStatus(id: string) {
        await this.findOne(id);
        const currentFile = await this.prisma.documentFile.findFirst({
            where: {
                entity_type: 'certification_agreement',
                entity_id: id,
                document_type: 'signed_certification_agreement',
                file_kind: 'signed_scan',
                is_current: true,
            },
            orderBy: { version_no: 'desc' },
        });
        const approved = await this.prisma.workflow_approvals.findFirst({
            where: { entity_type: 'P09_F18_SIGNED_EVIDENCE', entity_id: id, status: 'approved' },
            orderBy: { step_no: 'desc' },
        });
        let proof: { signed_file_id?: string; sha256?: string } = {};
        try { proof = JSON.parse(approved?.comment ?? '{}'); } catch { /* invalid legacy proof never passes */ }
        const verified = Boolean(currentFile?.sha256 && approved &&
            proof.signed_file_id === currentFile.id &&
            proof.sha256 === currentFile.sha256);
        return {
            agreement_id: id,
            signed_file: currentFile ? {
                id: currentFile.id, version_no: currentFile.version_no,
                sha256: currentFile.sha256,
                uploaded_at: currentFile.created_at,
            } : null,
            evidence_verified: verified,
            verified_by: verified ? approved?.approver_id : null,
            verified_at: verified ? approved?.approved_at : null,
            // The verifier attests an uploaded copy; a legal signature is never forged by CMP.
            legal_signatures_independently_validated: false,
        };
    }

    async verifyEvidence(id: string, dto: VerifyF18EvidenceDto, actor?: string) {
        if (!actor) throw new ForbiddenException('Không xác định được người xác minh F.18');
        if (!dto.verification_note?.trim() || dto.verification_note.trim().length < 20) {
            throw new BadRequestException('Cần ghi rõ bằng chứng kiểm tra bản ký F.18');
        }
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM dbo.certification_agreements WITH (UPDLOCK, HOLDLOCK) WHERE id = ${id}`;
            const agreement = await tx.certification_agreements.findUnique({ where: { id } });
            if (!agreement) throw new NotFoundException('Không tìm thấy F.18 cần xác minh');
            const signedFile = await tx.documentFile.findFirst({
                where: {
                    id: dto.signed_file_id,
                    entity_type: 'certification_agreement',
                    entity_id: id,
                    document_type: 'signed_certification_agreement',
                    file_kind: 'signed_scan',
                    is_current: true,
                },
            });
            if (!signedFile?.sha256) {
                throw new BadRequestException('Bản ký hiện hành F.18 không có mã kiểm tra SHA-256 hợp lệ');
            }
            if (signedFile.uploaded_by?.toLowerCase() === actor.toLowerCase()) {
                throw new ForbiddenException('Người tải bản ký không được tự xác minh');
            }
            const prior = await tx.workflow_approvals.findFirst({
                where: { entity_type: 'P09_F18_SIGNED_EVIDENCE', entity_id: id },
                orderBy: { step_no: 'desc' },
            });
            if (prior?.status === 'approved') {
                try {
                    const existing = JSON.parse(prior.comment ?? '{}');
                    if (existing.signed_file_id === signedFile.id && existing.sha256 === signedFile.sha256) {
                        throw new ConflictException('Bản ký F.18 đã được kiểm tra độc lập');
                    }
                } catch (error) {
                    if (error instanceof ConflictException) throw error;
                }
            }
            const result = await tx.workflow_approvals.create({
                data: {
                    entity_type: 'P09_F18_SIGNED_EVIDENCE',
                    entity_id: id,
                    step_no: (prior?.step_no ?? 0) + 1,
                    status: 'approved',
                    approver_id: actor,
                    approved_at: new Date(),
                    comment: JSON.stringify({
                        schema: 'CMP-P09-F18-1',
                        signed_file_id: signedFile.id,
                        sha256: signedFile.sha256,
                        file_version: signedFile.version_no,
                        agreement_number: agreement.agreement_number,
                        customer_id: agreement.customer_id,
                        verified_by: actor,
                        verification_note: dto.verification_note.trim(),
                    }),
                },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: actor, action: 'P09_F18_SIGNED_EVIDENCE_VERIFIED',
                    entity_type: 'certification_agreement', entity_id: id,
                    outcome: 'SUCCESS',
                    details_json: JSON.stringify({
                        approval_id: result.id, file_id: signedFile.id,
                        version_no: signedFile.version_no,
                    }),
                },
            });
            return { agreement_id: id, evidence_verified: true, signed_file_id: signedFile.id,
                verified_by: actor, evidence_approval_id: result.id };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }


    private readonly f18Languages = {
        vi: 'F.18-P.09.01',
        vi_en: 'F.18-P.09.02',
        vi_cn: 'F.18-P.09.03',
    } as const;
    // SHA-256 of the three owner-provided original F.18 legal templates.
    // An unrelated/even 'effective' template is not silently substituted.
    private readonly f18SourceSha256 = {
        vi: 'd74ba3d3a827f6578d04ce11e0e248b381b2d936ce2a47b73c62c59548f420c0',
        vi_en: 'b3254eea3fca969a56e9d8d58d6c9a85752f320381e41920e8838ae84da9077a',
        vi_cn: '29347d5d9c2df454bceb91b9028a56e5980287b653f5888e04bc3afcf17eecf8',
    } as const;

    async languageSources() {
        const values = await Promise.all(
            Object.entries(this.f18Languages).map(async ([language, templateCode]) => {
                const template = await this.prisma.controlled_template_versions.findFirst({
                    where: {
                        series: { template_code: templateCode, status: 'ACTIVE' },
                        status: 'EFFECTIVE',
                    },
                    orderBy: { revision_no: 'desc' },
                    include: { source_file: true },
                });
                return {
                    language, template_code: templateCode,
                    source_ready: Boolean(template?.source_file?.sha256 &&
                        template.source_file.original_name.toLowerCase().endsWith('.docx') &&
                        template.source_file.sha256.toLowerCase() ===
                            this.f18SourceSha256[language as 'vi' | 'vi_en' | 'vi_cn']),
                    effective_template_id: template?.id ?? null,
                    source_sha256: template?.source_file?.sha256 ?? null,
                };
            }),
        );
        return values;
    }

    async prepareLanguage(
        id: string,
        language: keyof CertificationAgreementsService['f18Languages'],
        format: 'docx' | 'pdf',
        actorId?: string,
    ) {
        if (!actorId) throw new ForbiddenException('Không xác định được người lập F.18');
        const templateCode = this.f18Languages[language];
        if (!templateCode || !['docx', 'pdf'].includes(format)) {
            throw new BadRequestException('Ngôn ngữ hoặc định dạng F.18 không hợp lệ');
        }
        if (!this.documentFiles) throw new ConflictException('Chưa cấu hình quản lý hồ sơ phiên bản');
        const agreement = await this.findOne(id);
        const project = await this.prisma.certification_projects.findFirst({
            where: { agreement_id: id },
            include: { certification_applications: true },
        });
        const application = project?.certification_applications;
        if (!application?.representative_name || !agreement.customers.company_name) {
            throw new ConflictException('Thiếu tên tổ chức hoặc người đại diện theo hồ sơ đăng ký');
        }
        const controlledSource = await this.prisma.controlled_template_versions.findFirst({
            where: {
                series: { template_code: templateCode, status: 'ACTIVE' },
                status: 'EFFECTIVE',
            },
            orderBy: { revision_no: 'desc' },
            include: { source_file: true },
        });
        if (!controlledSource?.source_file?.sha256 ||
            !controlledSource.source_file.original_name.toLowerCase().endsWith('.docx') ||
            controlledSource.source_file.sha256.toLowerCase() !== this.f18SourceSha256[language]) {
            throw new ConflictException('Chưa có nguồn mẫu F.18 gốc đã được kiểm soát và có hiệu lực');
        }
        const docsDir = getStorageConfig().documentsDirectory;
        const originalPath = join(docsDir, controlledSource.source_file.stored_name);
        if (!existsSync(originalPath)) throw new NotFoundException('Tệp nguồn F.18 không có trong kho lưu trữ');
        const builderCandidates = [
            join(__dirname, '..', 'reports', 'runtime', 'p09-f18-language-builder.cjs'),
            join(process.cwd(), 'dist', 'reports', 'runtime', 'p09-f18-language-builder.cjs'),
            join(process.cwd(), 'src', 'reports', 'runtime', 'p09-f18-language-builder.cjs'),
        ];
        const builderPath = builderCandidates.find(existsSync);
        if (!builderPath) throw new NotFoundException('Thiếu bộ xuất thỏa thuận đa ngôn ngữ');
        const render = require(builderPath) as {
            renderAgreementLanguage: (options: {
                templatePath: string; outputPath: string; language: string;
                data: Record<string, string>;
            }) => string;
        };
        mkdirSync(docsDir, { recursive: true });
        const filename = randomUUID();
        const docxPath = join(docsDir, filename + '.docx');
        const pdfPath = join(docsDir, filename + '.pdf');
        try {
            render.renderAgreementLanguage({
                templatePath: originalPath, outputPath: docxPath, language,
                data: {
                    agreement_number: agreement.agreement_number,
                    company: agreement.customers.company_name,
                    representative: application.representative_name,
                    position: application.representative_position ?? '',
                    address: application.headquarters_address ?? agreement.customers.address ?? '',
                    proposed_date: agreement.sign_date.toISOString().slice(0, 10),
                },
            });
            if (format === 'pdf') await convertDocxToPdf(docxPath, pdfPath, 600_000);
            const saved = await this.documentFiles.registerGenerated({
                entity_type: 'certification_agreement', entity_id: id,
                document_type: 'f18_agreement_' + language,
                file_kind: format === 'docx' ? 'generated_docx' : 'generated_pdf',
                original_name: `${templateCode}-${agreement.agreement_number.replace(/[^a-z0-9_-]/gi, '_')}.${format}`,
                stored_name: filename + '.' + format,
                absolute_path: format === 'docx' ? docxPath : pdfPath,
                mime_type: format === 'docx'
                    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    : 'application/pdf',
                note: `F.18 ${language} UNSIGNED. Source template ${controlledSource.id}, original SHA-256 ${controlledSource.source_file.sha256}. Original clauses retained.`,
                uploaded_by: actorId,
            });
            await this.prisma.audit_logs.create({ data: {
                user_id: actorId, action: 'P09_F18_PREPARE_LANGUAGE',
                entity_type: 'certification_agreement', entity_id: id,
                outcome: 'SUCCESS',
                details_json: JSON.stringify({
                    language, file_id: saved.id, source_template_id: controlledSource.id,
                    source_sha256: controlledSource.source_file.sha256, format,
                    unsigned: true,
                }),
            }});
            return { agreement_id: id, language, unsigned: true, document: saved,
                source_template_id: controlledSource.id,
                source_sha256: controlledSource.source_file.sha256 };
        } finally {
            if (format === 'pdf' && existsSync(docxPath)) unlinkSync(docxPath);
        }
    }

}