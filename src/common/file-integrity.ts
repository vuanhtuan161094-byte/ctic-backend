import { createHash } from 'crypto';
import {
    existsSync,
    readFileSync,
    statSync,
} from 'fs';
import {
    basename,
    extname,
} from 'path';

export const ALLOWED_DOCUMENT_EXTENSIONS = [
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.jpg',
    '.jpeg',
    '.png',
    '.zip',
    '.rar',
] as const;

export type AllowedDocumentExtension =
    (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number];

export const MIME_BY_EXTENSION: Record<AllowedDocumentExtension, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
};

const MIME_ALIASES_BY_EXTENSION: Partial<Record<AllowedDocumentExtension, readonly string[]>> = {
    '.xls': ['application/vnd.ms-excel', 'application/msexcel', 'application/x-msexcel'],
    '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip'],
    '.zip': ['application/zip', 'application/x-zip-compressed'],
    '.rar': ['application/vnd.rar', 'application/x-rar-compressed', 'application/x-rar'],
};

const GENERIC_MIME_TYPES = new Set([
    '',
    'application/octet-stream',
    'binary/octet-stream',
]);

export interface FileContentInspection {
    originalName: string;
    extension: AllowedDocumentExtension;
    mimeType: string;
    fileSize: number;
    sha256: string;
}

export function sanitizeOriginalFileName(value: string) {
    const raw = String(value ?? '')
        .replace(/\\/g, '/')
        .split('/')
        .pop() ?? '';

    const withoutControls = raw
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const fallback = withoutControls || 'document';

    if (fallback.length <= 255) {
        return fallback;
    }

    const extension = extname(fallback);
    const stem = basename(fallback, extension);
    const maxStemLength = Math.max(1, 255 - extension.length);

    return `${stem.slice(0, maxStemLength)}${extension}`;
}

export function getAllowedExtension(fileName: string): AllowedDocumentExtension {
    const extension = extname(fileName).toLowerCase() as AllowedDocumentExtension;

    if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(extension)) {
        throw new Error('UNSUPPORTED_EXTENSION');
    }

    return extension;
}

export function inspectDeclaredMetadata(
    fileName: string,
    declaredMime?: string,
    allowedExtensions: readonly AllowedDocumentExtension[] = ALLOWED_DOCUMENT_EXTENSIONS,
) {
    const originalName = sanitizeOriginalFileName(fileName);
    const extension = getAllowedExtension(originalName);

    if (!allowedExtensions.includes(extension)) {
        throw new Error('EXTENSION_NOT_ALLOWED_FOR_KIND');
    }

    const normalizedMime = (declaredMime ?? '').trim().toLowerCase();
    const acceptedMimes = MIME_ALIASES_BY_EXTENSION[extension] ?? [MIME_BY_EXTENSION[extension]];
    if (
        !GENERIC_MIME_TYPES.has(normalizedMime) &&
        !acceptedMimes.includes(normalizedMime)
    ) {
        throw new Error('MIME_EXTENSION_MISMATCH');
    }

    return {
        originalName,
        extension,
        mimeType: MIME_BY_EXTENSION[extension],
    };
}

function startsWithBytes(buffer: Buffer, bytes: readonly number[]) {
    if (buffer.length < bytes.length) {
        return false;
    }
    return bytes.every((byte, index) => buffer[index] === byte);
}

function endsWithBytes(buffer: Buffer, bytes: readonly number[]) {
    if (buffer.length < bytes.length) {
        return false;
    }
    const start = buffer.length - bytes.length;
    return bytes.every((byte, index) => buffer[start + index] === byte);
}

export function isPdfBuffer(buffer: Buffer) {
    const headerSearchLength = Math.min(buffer.length, 1024);
    const headerIndex = buffer
        .subarray(0, headerSearchLength)
        .indexOf(Buffer.from('%PDF-'));

    if (headerIndex < 0) {
        return false;
    }

    const tailStart = Math.max(0, buffer.length - 4096);
    return buffer.subarray(tailStart).includes(Buffer.from('%%EOF'));
}

export function isPngBuffer(buffer: Buffer) {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return startsWithBytes(buffer, signature) &&
        buffer.length >= 24 &&
        buffer.subarray(12, 16).toString('ascii') === 'IHDR';
}

export function isJpegBuffer(buffer: Buffer) {
    return startsWithBytes(buffer, [0xff, 0xd8, 0xff]) &&
        endsWithBytes(buffer, [0xff, 0xd9]);
}

export function isLegacyDocBuffer(buffer: Buffer) {
    return startsWithBytes(
        buffer,
        [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    );
}

export function isDocxBuffer(buffer: Buffer) {
    if (!startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) {
        return false;
    }

    // EOCD có thể nằm tối đa 65.557 byte tính từ cuối ZIP (comment tối đa 65.535).
    const minimumEocdSize = 22;
    if (buffer.length < minimumEocdSize) {
        return false;
    }

    const searchStart = Math.max(0, buffer.length - 65_557);
    let eocdOffset = -1;
    for (let offset = buffer.length - minimumEocdSize; offset >= searchStart; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }

    if (eocdOffset < 0 || eocdOffset + minimumEocdSize > buffer.length) {
        return false;
    }

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

    if (
        totalEntries <= 0 ||
        totalEntries > 10_000 ||
        centralDirectoryOffset + centralDirectorySize > eocdOffset
    ) {
        return false;
    }

    const names = new Set<string>();
    let position = centralDirectoryOffset;
    let totalUncompressedSize = 0;

    for (let index = 0; index < totalEntries; index += 1) {
        if (position + 46 > eocdOffset || buffer.readUInt32LE(position) !== 0x02014b50) {
            return false;
        }

        const uncompressedSize = buffer.readUInt32LE(position + 24);
        const fileNameLength = buffer.readUInt16LE(position + 28);
        const extraLength = buffer.readUInt16LE(position + 30);
        const commentLength = buffer.readUInt16LE(position + 32);
        const nextPosition = position + 46 + fileNameLength + extraLength + commentLength;

        if (nextPosition > eocdOffset || fileNameLength <= 0) {
            return false;
        }

        const fileName = buffer
            .subarray(position + 46, position + 46 + fileNameLength)
            .toString('utf8')
            .replace(/\\/g, '/');

        // Không chấp nhận entry thoát khỏi root của gói OOXML.
        if (
            fileName.startsWith('/') ||
            fileName.split('/').includes('..')
        ) {
            return false;
        }

        names.add(fileName);
        totalUncompressedSize += uncompressedSize;

        // Ngăn gói DOCX bất thường/zip bomb ngay từ metadata, dù server không giải nén upload.
        if (totalUncompressedSize > 200 * 1024 * 1024) {
            return false;
        }

        position = nextPosition;
    }

    const requiredEntries = [
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml',
    ];

    return requiredEntries.every((entry) => names.has(entry));
}

export function isXlsxBuffer(buffer: Buffer) {
    if (!startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) {
        return false;
    }

    const minimumEocdSize = 22;
    if (buffer.length < minimumEocdSize) {
        return false;
    }

    const searchStart = Math.max(0, buffer.length - 65_557);
    let eocdOffset = -1;
    for (let offset = buffer.length - minimumEocdSize; offset >= searchStart; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }

    if (eocdOffset < 0 || eocdOffset + minimumEocdSize > buffer.length) {
        return false;
    }

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (
        totalEntries <= 0 ||
        totalEntries > 10_000 ||
        centralDirectoryOffset + centralDirectorySize > eocdOffset
    ) {
        return false;
    }

    const names = new Set<string>();
    let position = centralDirectoryOffset;
    let totalUncompressedSize = 0;

    for (let index = 0; index < totalEntries; index += 1) {
        if (position + 46 > eocdOffset || buffer.readUInt32LE(position) !== 0x02014b50) {
            return false;
        }
        const uncompressedSize = buffer.readUInt32LE(position + 24);
        const fileNameLength = buffer.readUInt16LE(position + 28);
        const extraLength = buffer.readUInt16LE(position + 30);
        const commentLength = buffer.readUInt16LE(position + 32);
        const nextPosition = position + 46 + fileNameLength + extraLength + commentLength;
        if (nextPosition > eocdOffset || fileNameLength <= 0) {
            return false;
        }
        const fileName = buffer
            .subarray(position + 46, position + 46 + fileNameLength)
            .toString('utf8')
            .replace(/\\/g, '/');
        if (fileName.startsWith('/') || fileName.split('/').includes('..')) {
            return false;
        }
        names.add(fileName);
        totalUncompressedSize += uncompressedSize;
        if (totalUncompressedSize > 200 * 1024 * 1024) {
            return false;
        }
        position = nextPosition;
    }

    return [
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/workbook.xml',
    ].every((entry) => names.has(entry));
}

export function isZipBuffer(buffer: Buffer) {
    if (buffer.length < 22) return false;

    const startsWithLocalFile = startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]);
    const startsWithEmptyArchive = startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06]);
    if (!startsWithLocalFile && !startsWithEmptyArchive) return false;

    const minimumEocdSize = 22;
    const searchStart = Math.max(0, buffer.length - 65_557);
    let eocdOffset = -1;
    for (let offset = buffer.length - minimumEocdSize; offset >= searchStart; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }
    if (eocdOffset < 0) return false;

    const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    return centralDirectoryOffset + centralDirectorySize <= eocdOffset;
}

export function isRarBuffer(buffer: Buffer) {
    if (buffer.length < 8) return false;
    const rar4 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
    const rar5 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];
    return startsWithBytes(buffer, rar4) || startsWithBytes(buffer, rar5);
}

export function contentMatchesExtension(
    extension: AllowedDocumentExtension,
    buffer: Buffer,
) {
    switch (extension) {
        case '.pdf':
            return isPdfBuffer(buffer);
        case '.png':
            return isPngBuffer(buffer);
        case '.jpg':
        case '.jpeg':
            return isJpegBuffer(buffer);
        case '.docx':
            return isDocxBuffer(buffer);
        case '.xlsx':
            return isXlsxBuffer(buffer);
        case '.doc':
        case '.xls':
            return isLegacyDocBuffer(buffer);
        case '.zip':
            return isZipBuffer(buffer);
        case '.rar':
            return isRarBuffer(buffer);
    }
}

export function calculateBufferSha256(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

export function calculateFileSha256(filePath: string) {
    return calculateBufferSha256(readFileSync(filePath));
}

export function inspectStoredFile(
    filePath: string,
    originalName: string,
    declaredMime?: string,
    allowedExtensions: readonly AllowedDocumentExtension[] = ALLOWED_DOCUMENT_EXTENSIONS,
): FileContentInspection {
    if (!existsSync(filePath)) {
        throw new Error('FILE_NOT_FOUND');
    }

    const metadata = inspectDeclaredMetadata(
        originalName,
        declaredMime,
        allowedExtensions,
    );

    const fileSize = statSync(filePath).size;
    if (fileSize <= 0) {
        throw new Error('EMPTY_FILE');
    }

    const buffer = readFileSync(filePath);
    if (!contentMatchesExtension(metadata.extension, buffer)) {
        throw new Error('CONTENT_EXTENSION_MISMATCH');
    }

    return {
        ...metadata,
        fileSize,
        sha256: calculateBufferSha256(buffer),
    };
}
