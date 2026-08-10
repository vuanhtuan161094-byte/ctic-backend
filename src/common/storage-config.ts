import {
    accessSync,
    constants,
    existsSync,
    mkdirSync,
    unlinkSync,
    writeFileSync,
} from 'fs';
import {
    basename,
    isAbsolute,
    resolve,
    sep,
} from 'path';
import { randomUUID } from 'crypto';

export interface StorageConfig {
    rootDirectory: string;
    documentsDirectory: string;
    tempDirectory: string;
    backupsDirectory: string;
}

function resolveConfiguredDirectory(
    value: string | undefined,
    fallback: string,
) {
    const configured =
        value?.trim() ||
        fallback;

    return isAbsolute(
        configured,
    )
        ? resolve(
            configured,
        )
        : resolve(
            process.cwd(),
            configured,
        );
}

export function getStorageConfig(
    env: Record<string, string | undefined> =
        process.env,
): StorageConfig {
    const rootDirectory =
        resolveConfiguredDirectory(
            env.STORAGE_ROOT,
            'uploads',
        );

    return {
        rootDirectory,
        documentsDirectory:
            resolve(
                rootDirectory,
                'documents',
            ),
        tempDirectory:
            resolve(
                rootDirectory,
                'temp',
            ),
        backupsDirectory:
            resolve(
                rootDirectory,
                'backups',
            ),
    };
}

export function ensureStorageLayout(
    env: Record<string, string | undefined> =
        process.env,
) {
    const storage =
        getStorageConfig(
            env,
        );

    for (const directory of [
        storage.rootDirectory,
        storage.documentsDirectory,
        storage.tempDirectory,
        storage.backupsDirectory,
    ]) {
        mkdirSync(
            directory,
            {
                recursive: true,
            },
        );
    }

    assertStorageWritable(
        storage,
    );

    return storage;
}

export function assertStorageWritable(
    storage: StorageConfig =
        getStorageConfig(),
) {
    accessSync(
        storage.documentsDirectory,
        constants.R_OK |
            constants.W_OK,
    );

    accessSync(
        storage.tempDirectory,
        constants.R_OK |
            constants.W_OK,
    );

    const probePath =
        resolve(
            storage.tempDirectory,
            `.storage-probe-${randomUUID()}.tmp`,
        );

    try {
        writeFileSync(
            probePath,
            'ok',
            {
                encoding:
                    'utf8',
                flag:
                    'wx',
            },
        );
    } finally {
        if (
            existsSync(
                probePath,
            )
        ) {
            unlinkSync(
                probePath,
            );
        }
    }
}

export function resolveDocumentStoragePath(
    storedName: string,
    env: Record<string, string | undefined> =
        process.env,
) {
    const safeStoredName =
        basename(
            storedName,
        );

    if (
        !safeStoredName ||
        safeStoredName !==
            storedName
    ) {
        throw new Error(
            'Tên tệp lưu trữ không hợp lệ',
        );
    }

    const documentsDirectory =
        getStorageConfig(
            env,
        ).documentsDirectory;

    const absolutePath =
        resolve(
            documentsDirectory,
            safeStoredName,
        );

    if (
        !absolutePath.startsWith(
            `${documentsDirectory}${sep}`,
        )
    ) {
        throw new Error(
            'Đường dẫn tệp nằm ngoài kho tài liệu',
        );
    }

    return absolutePath;
}
