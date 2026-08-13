import {
  contentMatchesExtension,
  inspectDeclaredMetadata,
} from './file-integrity';

describe('archive document integrity', () => {
  it('accepts common ZIP and RAR MIME aliases', () => {
    expect(inspectDeclaredMetadata('evidence.zip', 'application/x-zip-compressed').extension).toBe('.zip');
    expect(inspectDeclaredMetadata('evidence.rar', 'application/x-rar-compressed').extension).toBe('.rar');
  });

  it('recognizes empty ZIP EOCD and RAR5 signatures', () => {
    const emptyZip = Buffer.alloc(22);
    emptyZip.writeUInt32LE(0x06054b50, 0);
    expect(contentMatchesExtension('.zip', emptyZip)).toBe(true);

    const rar5 = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00, 0x00]);
    expect(contentMatchesExtension('.rar', rar5)).toBe(true);
  });

  it('rejects archive extensions with unrelated content', () => {
    expect(contentMatchesExtension('.zip', Buffer.from('not-a-zip'))).toBe(false);
    expect(contentMatchesExtension('.rar', Buffer.from('not-a-rar'))).toBe(false);
  });
});
