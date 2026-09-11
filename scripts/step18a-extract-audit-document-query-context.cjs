const fs = require('node:fs');

const mainPath = 'src/audit-documents/audit-documents.service.ts';
const modulePath = 'src/audit-documents/audit-documents.module.ts';
const servicePath = 'src/audit-documents/audit-document-query-context.service.ts';
const specPath = 'src/audit-documents/audit-document-query-context.service.spec.ts';

for (const path of [servicePath, specPath]) {
  if (fs.existsSync(path)) {
    throw new Error(`Refusing to overwrite existing file: ${path}`);
  }
}

let source = fs.readFileSync(mainPath, 'utf8');
let moduleSource = fs.readFileSync(modulePath, 'utf8');

if (source.includes("./audit-document-query-context.service")) {
  throw new Error('Query context service already wired');
}

const nestImportOld = `    Injectable,\n    NotFoundException,\n} from '@nestjs/common';`;
const nestImportNew = `    Injectable,\n    NotFoundException,\n    Optional,\n} from '@nestjs/common';`;
if (!source.includes(nestImportOld)) {
  throw new Error('Nest import anchor not found');
}
source = source.replace(nestImportOld, nestImportNew);

const prismaImport = `import { PrismaService } from '../prisma/prisma.service';`;
if (!source.includes(prismaImport)) {
  throw new Error('Prisma import anchor not found');
}
source = source.replace(
  prismaImport,
  `${prismaImport}\nimport { AuditDocumentQueryContextService } from './audit-document-query-context.service';`,
);

const ctorOld = `    constructor(\n        private readonly prisma: PrismaService,\n        private readonly documentFilesService: DocumentFilesService,\n    ) { }`;
const ctorNew = `    private readonly queryContextService: AuditDocumentQueryContextService;\n\n    constructor(\n        private readonly prisma: PrismaService,\n        private readonly documentFilesService: DocumentFilesService,\n        @Optional()\n        queryContextService?: AuditDocumentQueryContextService,\n    ) {\n        this.queryContextService =\n            queryContextService ??\n            new AuditDocumentQueryContextService(prisma);\n    }`;
if (!source.includes(ctorOld)) {
  throw new Error('Constructor anchor not found');
}
source = source.replace(ctorOld, ctorNew);

const startMarker = `    private async loadPlan(planId: string) {`;
const endMarker = `    private async assertGenerationAccess(`;
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Query-context method block anchors not found');
}
const extracted = source.slice(start, end);
if (!extracted.includes('private async loadProgram(')) {
  throw new Error('Expected loadProgram inside extracted block');
}

const wrappers = `    private async loadPlan(planId: string) {\n        return this.queryContextService.loadPlan(planId);\n    }\n\n    private async loadProgram(programId: string | null | undefined) {\n        return this.queryContextService.loadProgram(programId);\n    }\n\n`;
source = source.slice(0, start) + wrappers + source.slice(end);

const serviceBody = extracted
  .replace('    private async loadPlan(', '    async loadPlan(')
  .replace('    private async loadProgram(', '    async loadProgram(');
const serviceSource = `import { Injectable, NotFoundException } from '@nestjs/common';\n\nimport { PrismaService } from '../prisma/prisma.service';\n\n@Injectable()\nexport class AuditDocumentQueryContextService {\n    constructor(\n        private readonly prisma: PrismaService,\n    ) { }\n\n${serviceBody}}\n`;

const moduleImportAnchor = `import { AuditDocumentsService } from './audit-documents.service';`;
if (!moduleSource.includes(moduleImportAnchor)) {
  throw new Error('Module import anchor not found');
}
moduleSource = moduleSource.replace(
  moduleImportAnchor,
  `${moduleImportAnchor}\nimport { AuditDocumentQueryContextService } from './audit-document-query-context.service';`,
);
const providerAnchor = `    providers: [\n        AuditDocumentsService,\n    ],`;
if (!moduleSource.includes(providerAnchor)) {
  throw new Error('Module provider anchor not found');
}
moduleSource = moduleSource.replace(
  providerAnchor,
  `    providers: [\n        AuditDocumentsService,\n        AuditDocumentQueryContextService,\n    ],`,
);

const specSource = `import { NotFoundException } from '@nestjs/common';\n\nimport { AuditDocumentQueryContextService } from './audit-document-query-context.service';\n\ndescribe('AuditDocumentQueryContextService', () => {\n    function createPrisma() {\n        return {\n            audit_plans: {\n                findUnique: jest.fn(),\n            },\n            organization_profiles: {\n                findUnique: jest.fn(),\n            },\n            audit_programs: {\n                findUnique: jest.fn(),\n            },\n        } as any;\n    }\n\n    it('loads the audit plan and attaches the current platform branding snapshot', async () => {\n        const prisma = createPrisma();\n        prisma.audit_plans.findUnique.mockResolvedValue({ id: 'plan-1' });\n        prisma.organization_profiles.findUnique.mockResolvedValue({\n            profile_key: 'PRIMARY',\n            certification_body_name: 'Example CB',\n        });\n        const service = new AuditDocumentQueryContextService(prisma);\n\n        const result = await service.loadPlan('plan-1');\n\n        expect(result).toEqual(expect.objectContaining({\n            id: 'plan-1',\n            platform_branding: expect.objectContaining({ profile_key: 'PRIMARY' }),\n        }));\n        expect(prisma.audit_plans.findUnique).toHaveBeenCalledWith(\n            expect.objectContaining({ where: { id: 'plan-1' } }),\n        );\n        expect(prisma.organization_profiles.findUnique).toHaveBeenCalledWith({\n            where: { profile_key: 'PRIMARY' },\n        });\n    });\n\n    it('throws when the audit plan does not exist', async () => {\n        const prisma = createPrisma();\n        prisma.audit_plans.findUnique.mockResolvedValue(null);\n        const service = new AuditDocumentQueryContextService(prisma);\n\n        await expect(service.loadPlan('missing')).rejects.toBeInstanceOf(NotFoundException);\n        expect(prisma.organization_profiles.findUnique).not.toHaveBeenCalled();\n    });\n\n    it('returns null without querying when no program id is supplied', async () => {\n        const prisma = createPrisma();\n        const service = new AuditDocumentQueryContextService(prisma);\n\n        await expect(service.loadProgram(null)).resolves.toBeNull();\n        expect(prisma.audit_programs.findUnique).not.toHaveBeenCalled();\n    });\n\n    it('loads the audit program context when an id is supplied', async () => {\n        const prisma = createPrisma();\n        prisma.audit_programs.findUnique.mockResolvedValue({ id: 'program-1' });\n        const service = new AuditDocumentQueryContextService(prisma);\n\n        await expect(service.loadProgram('program-1')).resolves.toEqual({ id: 'program-1' });\n        expect(prisma.audit_programs.findUnique).toHaveBeenCalledWith(\n            expect.objectContaining({ where: { id: 'program-1' } }),\n        );\n    });\n});\n`;

fs.writeFileSync(mainPath, source);
fs.writeFileSync(modulePath, moduleSource);
fs.writeFileSync(servicePath, serviceSource);
fs.writeFileSync(specPath, specSource);
