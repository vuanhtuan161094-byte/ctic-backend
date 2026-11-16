import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificationAgreementDto } from './dto/create-certification-agreement.dto';
import { VerifyF18EvidenceDto } from './dto/verify-f18-evidence.dto';

@Injectable()
export class CertificationAgreementsService {
    constructor(
        private readonly prisma: PrismaService,
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

}