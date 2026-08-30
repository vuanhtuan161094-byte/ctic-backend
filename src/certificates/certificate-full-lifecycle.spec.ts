import {
    canReplaceCertificateStatus,
    certificateActionForDecisionType,
    type CertificateDecisionType,
    type CertificateStatus,
} from './certificate-lifecycle';

type Version = {
    id: string;
    seriesId: string;
    versionNo: number;
    status: CertificateStatus;
    verificationCode: string;
    snapshot: Readonly<{
        organization: string;
        scope: string;
        site: string;
    }>;
    supersedesId: string | null;
    pdf: string | null;
};

describe('Phase 1 full certificate lifecycle regression', () => {
    it('classifies every permanent Phase 1 decision action', () => {
        const expected: Record<CertificateDecisionType, string> = {
            GRANT: 'CREATE_FIRST_VERSION',
            MAINTAIN: 'PRESERVE_CURRENT_VERSION',
            AMEND: 'CREATE_NEXT_VERSION',
            EXTEND_SCOPE: 'CREATE_NEXT_VERSION',
            REDUCE_SCOPE: 'CREATE_NEXT_VERSION',
            SUSPEND: 'TRANSITION_STATUS',
            RESTORE: 'TRANSITION_STATUS',
            WITHDRAW: 'TRANSITION_STATUS',
            RECERTIFY: 'CREATE_NEXT_VERSION',
            REFUSE: 'NO_CERTIFICATE',
        };

        for (const [decisionType, action] of Object.entries(expected)) {
            expect(certificateActionForDecisionType(
                decisionType as CertificateDecisionType,
            )).toBe(action);
        }
    });

    it('preserves one coherent series from GRANT through recertification', () => {
        const seriesId = 'series-main';
        const otherSeries: Version[] = [{
            id: 'other-v1',
            seriesId: 'series-other',
            versionNo: 1,
            status: 'active',
            verificationCode: 'verify-other-v1',
            snapshot: Object.freeze({
                organization: 'Other organization',
                scope: 'Other scope',
                site: 'Other site',
            }),
            supersedesId: null,
            pdf: 'other-v1.pdf',
        }];
        const versions: Version[] = [];

        const issue = (
            decisionType: 'GRANT' | 'AMEND' | 'RECERTIFY',
            snapshot: Version['snapshot'],
            pdf: string,
        ) => {
            const previous = versions.at(-1) ?? null;
            expect(certificateActionForDecisionType(decisionType))
                .toBe(previous
                    ? 'CREATE_NEXT_VERSION'
                    : 'CREATE_FIRST_VERSION');
            if (previous) {
                expect(canReplaceCertificateStatus(previous.status))
                    .toBe(true);
                previous.status = 'replaced';
            }
            const version: Version = {
                id: `main-v${versions.length + 1}`,
                seriesId,
                versionNo: versions.length + 1,
                status: 'active',
                verificationCode: `verify-main-v${versions.length + 1}`,
                snapshot: Object.freeze({ ...snapshot }),
                supersedesId: previous?.id ?? null,
                pdf,
            };
            versions.push(version);
            return version;
        };

        const v1 = issue('GRANT', {
            organization: 'Organization V1',
            scope: 'Initial scope',
            site: 'Site V1',
        }, 'certificate-v1.pdf');
        expect(v1.versionNo).toBe(1);

        const beforeMaintain = versions.map((item) => ({ ...item }));
        expect(certificateActionForDecisionType('MAINTAIN'))
            .toBe('PRESERVE_CURRENT_VERSION');
        expect(versions).toEqual(beforeMaintain);

        const v2 = issue('AMEND', {
            organization: 'Organization V2',
            scope: 'Extended approved scope',
            site: 'Site V2',
        }, 'certificate-v2.pdf');
        expect(v1.status).toBe('replaced');
        expect(v2.supersedesId).toBe(v1.id);
        expect(v1.pdf).toBe('certificate-v1.pdf');

        expect(certificateActionForDecisionType('SUSPEND'))
            .toBe('TRANSITION_STATUS');
        v2.status = 'suspended';
        expect(versions).toHaveLength(2);
        expect(certificateActionForDecisionType('RESTORE'))
            .toBe('TRANSITION_STATUS');
        v2.status = 'active';
        expect(versions).toHaveLength(2);

        const v3 = issue('RECERTIFY', {
            organization: 'Recertified Organization',
            scope: 'Recertified approved scope',
            site: 'Recertification site',
        }, 'certificate-v3.pdf');
        expect(v2.status).toBe('replaced');
        expect(v3).toEqual(expect.objectContaining({
            seriesId,
            versionNo: 3,
            status: 'active',
            supersedesId: v2.id,
        }));

        expect(new Set(versions.map((item) => item.verificationCode)).size)
            .toBe(3);
        const verificationIndex = new Map(
            versions.map((item) => [item.verificationCode, item]),
        );
        expect(verificationIndex.get('verify-main-v1')?.snapshot.organization)
            .toBe('Organization V1');
        expect(verificationIndex.get('verify-main-v2')?.snapshot.scope)
            .toBe('Extended approved scope');
        expect(verificationIndex.get('verify-main-v3')?.status)
            .toBe('active');
        expect(versions.filter((item) => item.status !== 'replaced'))
            .toEqual([v3]);
        expect(otherSeries).toEqual([
            expect.objectContaining({
                id: 'other-v1',
                status: 'active',
                pdf: 'other-v1.pdf',
            }),
        ]);
    });

    it('keeps WITHDRAW terminal in a separate branch and blocks recertification', () => {
        const withdrawn: Version = {
            id: 'withdraw-branch-v1',
            seriesId: 'withdraw-branch',
            versionNo: 1,
            status: 'withdrawn',
            verificationCode: 'verify-withdrawn',
            snapshot: Object.freeze({
                organization: 'Withdrawn Organization',
                scope: 'Withdrawn scope',
                site: 'Withdrawn site',
            }),
            supersedesId: null,
            pdf: 'withdrawn.pdf',
        };

        expect(certificateActionForDecisionType('WITHDRAW'))
            .toBe('TRANSITION_STATUS');
        expect(canReplaceCertificateStatus(withdrawn.status))
            .toBe(false);
        expect(certificateActionForDecisionType('RECERTIFY'))
            .toBe('CREATE_NEXT_VERSION');
    });
});
