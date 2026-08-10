'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'src', 'reports');
const outputRoot = path.join(projectRoot, 'dist', 'reports');

const assetDirectories = ['runtime', 'templates'];

function copyDirectory(source, destination) {
    if (!fs.existsSync(source)) {
        throw new Error(`Không tìm thấy thư mục tài nguyên: ${source}`);
    }

    fs.mkdirSync(destination, { recursive: true });
    fs.cpSync(source, destination, {
        recursive: true,
        force: true,
    });
}

for (const directory of assetDirectories) {
    copyDirectory(
        path.join(sourceRoot, directory),
        path.join(outputRoot, directory),
    );
}

console.log(
    '[report-assets] Đã sao chép runtime và mẫu Word vào dist/reports.',
);
