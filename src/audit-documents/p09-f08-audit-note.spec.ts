import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditDocumentsController } from './audit-documents.controller';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { SaveAuditDocumentDataDto } from './dto/save-audit-document-data.dto';

describe('P.09 F.08 original audit notes', () => {
    it('limits note updates to authorized internal audit document editors', () => {
        const method = AuditDocumentsController.prototype.saveData;
        const roles = Reflect.getMetadata(ROLES_KEY, method) as string[];
        expect(roles).toContain('LEAD_AUDITOR');
        expect(roles).toContain('AUDITOR');
        expect(roles).not.toContain('CUSTOMER');
        expect(Reflect.getMetadata(PERMISSIONS_KEY, method)).toEqual(['documents.manage']);
    });
    it('validates clause, content, finding types and maximum lengths', async () => {
        const valid = plainToInstance(SaveAuditDocumentDataDto, {
            audit_note_rows: [{ clause: '8.5.1', content: 'Kiểm tra hồ sơ và bằng chứng tại hiện trường', finding: 'Điểm quan sát' }],
        });
        expect(await validate(valid)).toHaveLength(0);
        const malformed = plainToInstance(SaveAuditDocumentDataDto, {
            audit_note_rows: [{ clause: 'x'.repeat(60), content: 11, finding: 'y'.repeat(8100) }],
        });
        const errors = await validate(malformed);
        expect(errors.find((error) => error.property === 'audit_note_rows')?.children?.length).toBeGreaterThan(0);
    });
    it('rejects array-shape violations on note rows', async () => {
        const malformed = plainToInstance(SaveAuditDocumentDataDto, {
            audit_note_rows: 'not-an-array',
        });
        expect((await validate(malformed)).some((error) => error.property === 'audit_note_rows')).toBe(true);
    });
});
