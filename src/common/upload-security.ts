import {
    BadRequestException,
    CallHandler,
    ConflictException,
    ExecutionContext,
    NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
    existsSync,
    renameSync,
    statSync,
    unlinkSync,
} from 'fs';
import { diskStorage } from 'multer';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import {
    ALLOWED_DOCUMENT_EXTENSIONS,
    AllowedDocumentExtension,
    calculateFileSha256,
    inspectDeclaredMetadata,
    inspectStoredFile,
} from './file-integrity';
import {
    getStorageConfig,
    resolveDocumentStoragePath,
} from './storage-config';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const EXTENSIONS_BY_FILE_KIND: Record<string, AllowedDocumentExtension[]> = {
    generated_docx: ['.docx'],
    generated_pdf: ['.pdf'],
    signed_scan: ['.pdf'],
    attachment: [...ALLOWED_DOCUMENT_EXTENSIONS],
};

function removeIfExists(filePath?: string) {
    if (filePath && existsSync(filePath)) {
        unlinkSync(filePath);
    }
}

function toBadRequest(error: unknown): BadRequestException {
    const code = error instanceof Error ? error.message : '';

    const messageByCode: Record<string, string> = {
        UNSUPPORTED_EXTENSION: 'Chỉ chấp nhận tệp PDF, Word, JPG hoặc PNG',
        EXTENSION_NOT_ALLOWED_FOR_KIND: 'Định dạng tệp không phù hợp với loại hồ sơ đã chọn',
        MIME_EXTENSION_MISMATCH: 'Phần mở rộng và MIME type của tệp không khớp',
        FILE_NOT_FOUND: 'Không tìm thấy tệp vừa tải lên',
        EMPTY_FILE: 'Tệp tải lên đang rỗng',
        CONTENT_EXTENSION_MISMATCH: 'Nội dung thực tế của tệp không khớp với định dạng khai báo',
    };

    return new BadRequestException(
        messageByCode[code] ?? 'Tệp tải lên không hợp lệ',
    );
}

export function assertUploadMetadata(
    fileName: string,
    declaredMime?: string,
    allowedExtensions: readonly AllowedDocumentExtension[] = ALLOWED_DOCUMENT_EXTENSIONS,
) {
    try {
        return inspectDeclaredMetadata(
            fileName,
            declaredMime,
            allowedExtensions,
        );
    } catch (error) {
        throw toBadRequest(error);
    }
}

export function validateUploadedFile(
    file: Express.Multer.File,
    fileKind?: string,
) {
    if (!file?.path || !existsSync(file.path)) {
        throw new BadRequestException('Không tìm thấy tệp vừa tải lên');
    }

    try {
        const allowedExtensions = fileKind
            ? EXTENSIONS_BY_FILE_KIND[fileKind]
            : undefined;

        if (fileKind && !allowedExtensions) {
            throw new BadRequestException('Loại tệp hồ sơ không hợp lệ');
        }

        const result = inspectStoredFile(
            file.path,
            file.originalname,
            file.mimetype,
            allowedExtensions,
        );

        if (result.fileSize > MAX_UPLOAD_BYTES) {
            throw new BadRequestException('Dung lượng tệp vượt quá 20 MB');
        }

        return result;
    } catch (error) {
        removeIfExists(file.path);
        if (error instanceof BadRequestException) {
            throw error;
        }
        throw toBadRequest(error);
    }
}

export function validateGeneratedDocument(
    absolutePath: string,
    originalName: string,
    mimeType: string,
) {
    try {
        return inspectStoredFile(
            absolutePath,
            originalName,
            mimeType,
        );
    } catch (error) {
        removeIfExists(absolutePath);
        throw toBadRequest(error);
    }
}

export function promoteValidatedUpload(
    file: Express.Multer.File,
    extension: AllowedDocumentExtension,
) {
    const storedName = `${randomUUID()}${extension}`;
    const destination = resolveDocumentStoragePath(storedName);

    try {
        renameSync(file.path, destination);
    } catch (error) {
        removeIfExists(file.path);
        throw error;
    }

    return {
        storedName,
        absolutePath: destination,
    };
}

export function verifyStoredFileIntegrity(
    absolutePath: string,
    expectedSize: number,
    expectedSha256?: string | null,
) {
    if (!existsSync(absolutePath)) {
        throw new ConflictException('Tệp vật lý không còn tồn tại trong kho hồ sơ');
    }

    const actualSize = statSync(absolutePath).size;
    if (actualSize !== expectedSize) {
        throw new ConflictException(
            'Tệp hồ sơ không đạt kiểm tra toàn vẹn: dung lượng đã thay đổi',
        );
    }

    if (expectedSha256) {
        const actualSha256 = calculateFileSha256(absolutePath);
        if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
            throw new ConflictException(
                'Tệp hồ sơ không đạt kiểm tra toàn vẹn: SHA-256 không khớp',
            );
        }
    }
}

export function createSecureUploadOptions(
    allowedExtensions: readonly AllowedDocumentExtension[] = ALLOWED_DOCUMENT_EXTENSIONS,
) {
    return {
        storage: diskStorage({
            destination: (
                _request: unknown,
                _file: unknown,
                callback: (error: Error | null, destination: string) => void,
            ) => callback(null, getStorageConfig().tempDirectory),
            filename: (
                _request: unknown,
                _file: unknown,
                callback: (error: Error | null, filename: string) => void,
            ) => callback(null, `${randomUUID()}.upload`),
        }),
        limits: {
            fileSize: MAX_UPLOAD_BYTES,
            files: 1,
        },
        fileFilter: (
            _request: unknown,
            file: Express.Multer.File,
            callback: (error: Error | null, acceptFile: boolean) => void,
        ) => {
            try {
                assertUploadMetadata(
                    file.originalname,
                    file.mimetype,
                    allowedExtensions,
                );
                callback(null, true);
            } catch (error) {
                callback(error as Error, false);
            }
        },
    };
}

/**
 * Dọn tệp tạm nếu DTO validation, pipe hoặc handler lỗi trước khi service
 * promote tệp đã xác minh vào kho documents.
 */
export class TempUploadCleanupInterceptor implements NestInterceptor {
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ) {
        const request = context.switchToHttp().getRequest<{
            file?: Express.Multer.File;
        }>();

        return next.handle().pipe(
            catchError((error: unknown) => {
                removeIfExists(request.file?.path);
                return throwError(() => error);
            }),
        );
    }
}
