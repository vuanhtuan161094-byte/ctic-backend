const fs = require('node:fs');

const mainPath = 'src/technical-reviews/technical-reviews.service.ts';
const modulePath = 'src/technical-reviews/technical-reviews.module.ts';
const servicePath = 'src/technical-reviews/technical-review-query-context.service.ts';
const specPath = 'src/technical-reviews/technical-review-query-context.service.spec.ts';

let source = fs.readFileSync(mainPath, 'utf8');
let moduleSource = fs.readFileSync(modulePath, 'utf8');

if (fs.existsSync(servicePath) || fs.existsSync(specPath)) {
  throw new Error('Query context extraction target already exists');
}

const importAnchor = "import { TechnicalReviewReviewerPolicyService } from './technical-review-reviewer-policy.service';\n";
if (source.split(importAnchor).length - 1 !== 1) throw new Error('Main import anchor mismatch');
source = source.replace(
  importAnchor,
  importAnchor + "import { TechnicalReviewQueryContextService } from './technical-review-query-context.service';\n",
);

const classFieldAnchor = '    private readonly reviewerPolicyService: TechnicalReviewReviewerPolicyService;\n\n';
if (source.split(classFieldAnchor).length - 1 !== 1) throw new Error('Class field anchor mismatch');
source = source.replace(
  classFieldAnchor,
  classFieldAnchor + '    private readonly queryContextService: TechnicalReviewQueryContextService;\n\n',
);

const constructorAnchor = `        @Optional()\n        reviewerPolicyService?: TechnicalReviewReviewerPolicyService,\n    ) {\n        this.reviewerPolicyService =\n            reviewerPolicyService ??\n            new TechnicalReviewReviewerPolicyService(prisma);\n    }\n`;
const constructorReplacement = `        @Optional()\n        reviewerPolicyService?: TechnicalReviewReviewerPolicyService,\n        @Optional()\n        queryContextService?: TechnicalReviewQueryContextService,\n    ) {\n        this.reviewerPolicyService =\n            reviewerPolicyService ??\n            new TechnicalReviewReviewerPolicyService(prisma);\n        this.queryContextService =\n            queryContextService ??\n            new TechnicalReviewQueryContextService(prisma);\n    }\n`;
if (source.split(constructorAnchor).length - 1 !== 1) throw new Error('Constructor anchor mismatch');
source = source.replace(constructorAnchor, constructorReplacement);

const getStart = source.indexOf('    private async getReviewOrThrow(');
const loadStart = source.indexOf('    private async loadPlanReviewContext(', getStart);
const nextStart = source.indexOf('    private assertReviewerIndependent(', loadStart);
if (getStart < 0 || loadStart < 0 || nextStart < 0 || !(getStart < loadStart && loadStart < nextStart)) {
  throw new Error('Query context method boundaries not found');
}

const extractedMethods = source
  .slice(getStart, nextStart)
  .replace(/^    private async /gm, '    async ')
  .trimEnd();

const wrappers = `    private async getReviewOrThrow(\n        id: string,\n    ) {\n        return this.queryContextService.getReviewOrThrow(\n            id,\n        );\n    }\n\n    private async loadPlanReviewContext(\n        planId: string,\n    ) {\n        return this.queryContextService.loadPlanReviewContext(\n            planId,\n        );\n    }\n\n`;
source = source.slice(0, getStart) + wrappers + source.slice(nextStart);

if (source.split('NotFoundException').length - 1 === 1) {
  source = source.replace('    NotFoundException,\n', '');
}

const moduleImportAnchor = "import { TechnicalReviewReviewerPolicyService } from './technical-review-reviewer-policy.service';\n";
if (moduleSource.split(moduleImportAnchor).length - 1 !== 1) throw new Error('Module import anchor mismatch');
moduleSource = moduleSource.replace(
  moduleImportAnchor,
  moduleImportAnchor + "import { TechnicalReviewQueryContextService } from './technical-review-query-context.service';\n",
);

const providerAnchor = '    TechnicalReviewReviewerPolicyService,\n';
if (moduleSource.split(providerAnchor).length - 1 !== 1) throw new Error('Module provider anchor mismatch');
moduleSource = moduleSource.replace(
  providerAnchor,
  providerAnchor + '    TechnicalReviewQueryContextService,\n',
);

const extractedService = `import { Injectable, NotFoundException } from '@nestjs/common';\n\nimport { PrismaService } from '../prisma/prisma.service';\n\n@Injectable()\nexport class TechnicalReviewQueryContextService {\n    constructor(private readonly prisma: PrismaService) {}\n\n${extractedMethods}\n}\n`;

const extractedSpec = `import { NotFoundException } from '@nestjs/common';\n\nimport { PrismaService } from '../prisma/prisma.service';\nimport { TechnicalReviewQueryContextService } from './technical-review-query-context.service';\n\nfunction createService() {\n    const prisma = {\n        technical_reviews: {\n            findUnique: jest.fn(),\n        },\n        audit_plans: {\n            findUnique: jest.fn(),\n        },\n    };\n    return {\n        prisma,\n        service: new TechnicalReviewQueryContextService(\n            prisma as unknown as PrismaService,\n        ),\n    };\n}\n\ndescribe('TechnicalReviewQueryContextService', () => {\n    it('returns a review resolved by id', async () => {\n        const { prisma, service } = createService();\n        const review = {\n            id: 'review-1',\n            reports: { audit_plan_id: 'plan-1' },\n            assignments: [],\n        };\n        prisma.technical_reviews.findUnique.mockResolvedValue(review);\n\n        await expect(service.getReviewOrThrow('review-1')).resolves.toBe(review);\n        expect(prisma.technical_reviews.findUnique).toHaveBeenCalledWith(\n            expect.objectContaining({\n                where: { id: 'review-1' },\n            }),\n        );\n    });\n\n    it('rejects a missing technical review', async () => {\n        const { prisma, service } = createService();\n        prisma.technical_reviews.findUnique.mockResolvedValue(null);\n\n        await expect(service.getReviewOrThrow('missing'))\n            .rejects.toBeInstanceOf(NotFoundException);\n    });\n\n    it('returns the plan and latest ordered report context', async () => {\n        const { prisma, service } = createService();\n        const latestReport = { id: 'report-latest' };\n        const plan = {\n            id: 'plan-1',\n            reports: [latestReport, { id: 'report-older' }],\n        };\n        prisma.audit_plans.findUnique.mockResolvedValue(plan);\n\n        await expect(service.loadPlanReviewContext('plan-1')).resolves.toEqual({\n            plan,\n            report: latestReport,\n        });\n        expect(prisma.audit_plans.findUnique).toHaveBeenCalledWith(\n            expect.objectContaining({\n                where: { id: 'plan-1' },\n            }),\n        );\n    });\n\n    it('rejects a missing audit plan', async () => {\n        const { prisma, service } = createService();\n        prisma.audit_plans.findUnique.mockResolvedValue(null);\n\n        await expect(service.loadPlanReviewContext('missing'))\n            .rejects.toBeInstanceOf(NotFoundException);\n    });\n});\n`;

fs.writeFileSync(mainPath, source);
fs.writeFileSync(modulePath, moduleSource);
fs.writeFileSync(servicePath, extractedService);
fs.writeFileSync(specPath, extractedSpec);
