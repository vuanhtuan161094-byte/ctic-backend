'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) !== 0
                ? (0xedb88320 ^ (value >>> 1))
                : (value >>> 1);
        }
        table[index] = value >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer) {
    const minimum = Math.max(0, buffer.length - 0xffff - 22);
    for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
        if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
            return offset;
        }
    }
    throw new Error('Tệp DOCX không có central directory hợp lệ');
}

function readZipEntries(zipPath) {
    const archive = fs.readFileSync(zipPath);
    const eocdOffset = findEndOfCentralDirectory(archive);
    const entryCount = archive.readUInt16LE(eocdOffset + 10);
    const centralOffset = archive.readUInt32LE(eocdOffset + 16);
    const entries = [];
    let offset = centralOffset;

    for (let index = 0; index < entryCount; index += 1) {
        if (archive.readUInt32LE(offset) !== CENTRAL_DIRECTORY_HEADER) {
            throw new Error('Central directory của DOCX bị hỏng');
        }

        const flags = archive.readUInt16LE(offset + 8);
        const method = archive.readUInt16LE(offset + 10);
        const compressedSize = archive.readUInt32LE(offset + 20);
        const uncompressedSize = archive.readUInt32LE(offset + 24);
        const nameLength = archive.readUInt16LE(offset + 28);
        const extraLength = archive.readUInt16LE(offset + 30);
        const commentLength = archive.readUInt16LE(offset + 32);
        const externalAttributes = archive.readUInt32LE(offset + 38);
        const localOffset = archive.readUInt32LE(offset + 42);
        const nameBuffer = archive.subarray(offset + 46, offset + 46 + nameLength);
        const name = nameBuffer.toString((flags & 0x0800) !== 0 ? 'utf8' : 'binary');

        if (archive.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
            throw new Error(`Local header không hợp lệ: ${name}`);
        }

        const localNameLength = archive.readUInt16LE(localOffset + 26);
        const localExtraLength = archive.readUInt16LE(localOffset + 28);
        const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);

        let data;
        if (method === 0) {
            data = Buffer.from(compressed);
        } else if (method === 8) {
            data = zlib.inflateRawSync(compressed);
        } else {
            throw new Error(`DOCX dùng phương thức nén chưa được hỗ trợ (${method}): ${name}`);
        }

        if (data.length !== uncompressedSize) {
            throw new Error(`Kích thước entry không khớp: ${name}`);
        }

        entries.push({
            name,
            data,
            isDirectory: name.endsWith('/'),
            externalAttributes,
        });

        offset += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
}

function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (
        (date.getHours() << 11) |
        (date.getMinutes() << 5) |
        Math.floor(date.getSeconds() / 2)
    );
    const dosDate = (
        ((year - 1980) << 9) |
        ((date.getMonth() + 1) << 5) |
        date.getDate()
    );
    return { dosTime, dosDate };
}

function writeZipEntries(entries, outputPath) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const { dosTime, dosDate } = dosDateTime();

    for (const entry of entries) {
        const name = Buffer.from(entry.name, 'utf8');
        const source = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
        const method = entry.isDirectory ? 0 : 8;
        const compressed = method === 0 ? source : zlib.deflateRawSync(source, { level: 6 });
        const checksum = crc32(source);
        const flags = 0x0800;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(LOCAL_FILE_HEADER, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(flags, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(dosTime, 10);
        local.writeUInt16LE(dosDate, 12);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(source.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        localParts.push(local, name, compressed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(CENTRAL_DIRECTORY_HEADER, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(flags, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(dosTime, 12);
        central.writeUInt16LE(dosDate, 14);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(source.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(
            entry.externalAttributes ?? (entry.isDirectory ? 0x10 : 0),
            38,
        );
        central.writeUInt32LE(localOffset, 42);
        centralParts.push(central, name);

        localOffset += local.length + name.length + compressed.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirectory.length, 12);
    eocd.writeUInt32LE(localOffset, 16);
    eocd.writeUInt16LE(0, 20);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, Buffer.concat([...localParts, centralDirectory, eocd]));
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function flattenScalars(value, prefix = '', output = {}) {
    if (Array.isArray(value)) {
        return output;
    }
    if (isPlainObject(value)) {
        for (const [key, item] of Object.entries(value)) {
            const next = prefix ? `${prefix}.${key}` : key;
            flattenScalars(item, next, output);
        }
        return output;
    }
    if (prefix) {
        output[prefix] = value;
    }
    return output;
}

function escapeXml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function xmlText(value) {
    const normalized = value === null || value === undefined || String(value).trim() === ''
        ? '—'
        : String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalized
        .split('\n')
        .map(escapeXml)
        .join('</w:t><w:br/><w:t xml:space="preserve">');
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceToken(xml, token, value) {
    const pattern = new RegExp(`{{\\s*${escapeRegex(token)}\\s*}}`, 'g');
    return xml.replace(pattern, xmlText(value));
}

function replaceObjectTokens(xml, values) {
    const flat = flattenScalars(values);
    let output = xml;
    for (const [token, value] of Object.entries(flat)) {
        output = replaceToken(output, token, value);
    }
    return output;
}

function expandRepeatRows(xml, data) {
    return xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (rowXml) => {
        const marker = rowXml.match(/{{#([A-Za-z0-9_]+)}}/);
        if (!marker) {
            return rowXml;
        }
        const key = marker[1];
        const closing = new RegExp(`{{\\/${escapeRegex(key)}}}`, 'g');
        const opening = new RegExp(`{{#${escapeRegex(key)}}}`, 'g');
        const list = Array.isArray(data[key]) && data[key].length > 0
            ? data[key]
            : [{}];

        return list.map((item) => {
            let expanded = rowXml.replace(opening, '').replace(closing, '');
            expanded = replaceObjectTokens(expanded, item);
            return expanded;
        }).join('');
    });
}

function cleanUnresolvedTokens(xml) {
    return xml
        .replace(/{{#[A-Za-z0-9_]+}}/g, '')
        .replace(/{{\/[A-Za-z0-9_]+}}/g, '')
        .replace(/{{\s*[A-Za-z0-9_.]+\s*}}/g, '—');
}

function renderXml(xml, data) {
    let output = expandRepeatRows(xml, data);
    output = replaceObjectTokens(output, data);
    output = cleanUnresolvedTokens(output);
    return output;
}

function renderDocxTemplate({ templatePath, outputPath, data }) {
    const entries = readZipEntries(templatePath).map((entry) => {
        const shouldRender = /^word\/(document|header\d+|footer\d+)\.xml$/.test(entry.name);
        if (!shouldRender) {
            return entry;
        }
        const xml = entry.data.toString('utf8');
        return {
            ...entry,
            data: Buffer.from(renderXml(xml, data), 'utf8'),
        };
    });
    writeZipEntries(entries, outputPath);
    return outputPath;
}


function xlsxText(value) {
    const normalized = value === null || value === undefined || String(value).trim() === ''
        ? '—'
        : String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return escapeXml(normalized).replace(/\n/g, '&#10;');
}

function replaceXlsxToken(xml, token, value) {
    const pattern = new RegExp(`{{\\s*${escapeRegex(token)}\\s*}}`, 'g');
    return xml.replace(pattern, xlsxText(value));
}

function renderXlsxXml(xml, data) {
    const flat = flattenScalars(data);
    let output = xml;
    for (const [token, value] of Object.entries(flat)) {
        output = replaceXlsxToken(output, token, value);
    }
    return output.replace(/{{\s*[A-Za-z0-9_.]+\s*}}/g, '—');
}

function renderXlsxTemplate({ templatePath, outputPath, data }) {
    const entries = readZipEntries(templatePath).map((entry) => {
        const shouldRender = entry.name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name);
        if (!shouldRender) {
            return entry;
        }
        const xml = entry.data.toString('utf8');
        return {
            ...entry,
            data: Buffer.from(renderXlsxXml(xml, data), 'utf8'),
        };
    });
    writeZipEntries(entries, outputPath);
    return outputPath;
}

function listTemplateTokens(templatePath) {
    const tokens = new Set();
    for (const entry of readZipEntries(templatePath)) {
        if (!entry.name.endsWith('.xml')) continue;
        const xml = entry.data.toString('utf8');
        for (const match of xml.matchAll(/{{\s*([#/]?[A-Za-z0-9_.]+)\s*}}/g)) {
            tokens.add(match[1]);
        }
    }
    return Array.from(tokens).sort();
}

module.exports = {
    listTemplateTokens,
    readZipEntries,
    renderDocxTemplate,
    renderXlsxTemplate,
    writeZipEntries,
};
