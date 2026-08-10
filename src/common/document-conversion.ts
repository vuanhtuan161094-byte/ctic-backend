import {
    BadRequestException,
} from '@nestjs/common';

import {
    execFile,
} from 'child_process';

import {
    existsSync,
    renameSync,
} from 'fs';

import {
    basename,
    dirname,
    join,
} from 'path';

import {
    promisify,
} from 'util';

const execFileAsync =
    promisify(
        execFile,
    );

function officeCandidates() {
    const configured =
        process.env.LIBREOFFICE_PATH
            ?.trim();

    const platformSpecific =
        process.platform === 'win32'
            ? [
                'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
                'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
            ]
            : process.platform === 'darwin'
                ? [
                    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
                ]
                : [
                    '/usr/bin/libreoffice',
                    '/usr/bin/soffice',
                ];

    return Array.from(
        new Set(
            [
                configured,
                'soffice',
                'libreoffice',
                ...platformSpecific,
            ].filter(Boolean) as string[],
        ),
    );
}

async function tryLibreOffice(
    docxPath: string,
    pdfPath: string,
    timeoutMs: number,
) {
    const outputDirectory =
        dirname(
            pdfPath,
        );

    for (
        const executable of
        officeCandidates()
    ) {
        try {
            await execFileAsync(
                executable,
                [
                    '--headless',
                    '--convert-to',
                    'pdf',
                    '--outdir',
                    outputDirectory,
                    docxPath,
                ],
                {
                    timeout:
                        timeoutMs,
                    windowsHide:
                        true,
                },
            );

            const generated =
                join(
                    outputDirectory,
                    `${basename(docxPath, '.docx')}.pdf`,
                );

            if (
                existsSync(
                    generated,
                )
            ) {
                if (
                    generated !==
                    pdfPath
                ) {
                    renameSync(
                        generated,
                        pdfPath,
                    );
                }

                return true;
            }
        } catch {
            // Thử executable tiếp theo. Không log từng lỗi để tránh làm nhiễu log production.
        }
    }

    return false;
}

async function tryMicrosoftWord(
    docxPath: string,
    pdfPath: string,
    timeoutMs: number,
) {
    if (
        process.platform !==
        'win32'
    ) {
        return false;
    }

    const inputBase64 =
        Buffer.from(
            docxPath,
            'utf8',
        ).toString(
            'base64',
        );

    const outputBase64 =
        Buffer.from(
            pdfPath,
            'utf8',
        ).toString(
            'base64',
        );

    const script = `
$ErrorActionPreference = 'Stop'
$inputPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${inputBase64}'))
$outputPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${outputBase64}'))
$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open($inputPath, $false, $true)
    $document.SaveAs([ref]$outputPath, [ref]17)
} finally {
    if ($document -ne $null) { $document.Close($false) }
    if ($word -ne $null) { $word.Quit() }
    if ($document -ne $null) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
    if ($word -ne $null) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
`;

    const encoded =
        Buffer.from(
            script,
            'utf16le',
        ).toString(
            'base64',
        );

    for (
        const executable of
        [
            'powershell.exe',
            'pwsh.exe',
        ]
    ) {
        try {
            await execFileAsync(
                executable,
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-EncodedCommand',
                    encoded,
                ],
                {
                    timeout:
                        timeoutMs,
                    windowsHide:
                        true,
                },
            );

            if (
                existsSync(
                    pdfPath,
                )
            ) {
                return true;
            }
        } catch {
            // Thử PowerShell executable tiếp theo.
        }
    }

    return false;
}

export async function convertDocxToPdf(
    docxPath: string,
    pdfPath: string,
    timeoutMs = 600_000,
) {
    const converted =
        await tryLibreOffice(
            docxPath,
            pdfPath,
            timeoutMs,
        ) ||
        await tryMicrosoftWord(
            docxPath,
            pdfPath,
            timeoutMs,
        );

    if (
        !converted ||
        !existsSync(
            pdfPath,
        )
    ) {
        throw new BadRequestException(
            'Không thể chuyển Word sang PDF. Máy chủ cần LibreOffice (Windows/Linux/macOS) hoặc Microsoft Word trên Windows. Có thể cấu hình LIBREOFFICE_PATH nếu soffice không nằm trong PATH.',
        );
    }
}
