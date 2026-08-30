import {
    assertCertificateStatusTransition,
    canTransitionCertificateStatus,
    certificateActionForDecisionType,
    classifyAuditLifecycle,
    decisionPreservesCurrentCertificate,
    decisionChangesCertifiedScope,
    decisionRequiresChangeReason,
    decisionRequiresCertificateVersion,
    inferLegacyDecisionType,
    isDecisionTypeAllowedForLifecycle,
    isStatusDecisionType,
    normalizeDecisionType,
    allowedStatusDecisionTypesForCertificateStatus,
    canReplaceCertificateStatus,
    phase12WorkspaceDecisionTypes,
    phase13WorkspaceDecisionTypes,
    phase14WorkspaceDecisionTypes,
    statusTargetForDecisionType,
} from './certificate-lifecycle';

describe('certificate lifecycle', () => {
    it('validates decision types without conflating decision result', () => {
        expect(normalizeDecisionType('extend_scope')).toBe('EXTEND_SCOPE');
        expect(normalizeDecisionType('unknown')).toBeNull();
    });

    it('classifies initial Stage 2 and GRANT', () => {
        const lifecycle = classifyAuditLifecycle('stage2', 'initial_stage2');
        expect(lifecycle).toBe('INITIAL_STAGE2');
        expect(isDecisionTypeAllowedForLifecycle('GRANT', lifecycle)).toBe(true);
        expect(isDecisionTypeAllowedForLifecycle('RESTORE', lifecycle)).toBe(false);
        expect(certificateActionForDecisionType('GRANT')).toBe('CREATE_FIRST_VERSION');
    });

    it('classifies surveillance MAINTAIN as preserving the current version', () => {
        const lifecycle = classifyAuditLifecycle('surveillance1');
        expect(lifecycle).toBe('SURVEILLANCE');
        expect(isDecisionTypeAllowedForLifecycle('MAINTAIN', lifecycle)).toBe(true);
        expect(decisionPreservesCurrentCertificate('MAINTAIN')).toBe(true);
        expect(decisionRequiresCertificateVersion('MAINTAIN')).toBe(false);
    });

    it('projects only Phase 1.2 decision types into the operational workspace', () => {
        expect(phase12WorkspaceDecisionTypes('INITIAL_STAGE2')).toEqual([
            'GRANT',
        ]);
        expect(phase12WorkspaceDecisionTypes('SURVEILLANCE')).toEqual([
            'MAINTAIN',
            'AMEND',
            'EXTEND_SCOPE',
            'REDUCE_SCOPE',
        ]);
        expect(phase12WorkspaceDecisionTypes('RECERTIFICATION')).toEqual([]);
    });

    it('requires a reason for certificate changes and scope comparison only where relevant', () => {
        expect(decisionRequiresChangeReason('MAINTAIN')).toBe(false);
        expect(decisionRequiresChangeReason('AMEND')).toBe(true);
        expect(decisionRequiresChangeReason('EXTEND_SCOPE')).toBe(true);
        expect(decisionRequiresChangeReason('REDUCE_SCOPE')).toBe(true);
        expect(decisionChangesCertifiedScope('AMEND')).toBe(false);
        expect(decisionChangesCertifiedScope('EXTEND_SCOPE')).toBe(true);
        expect(decisionChangesCertifiedScope('REDUCE_SCOPE')).toBe(true);
    });

    it('classifies RECERTIFY as a version-producing action', () => {
        const lifecycle = classifyAuditLifecycle('recertification');
        expect(isDecisionTypeAllowedForLifecycle('RECERTIFY', lifecycle)).toBe(true);
        expect(certificateActionForDecisionType('RECERTIFY')).toBe('CREATE_NEXT_VERSION');
    });

    it('exposes RECERTIFY only for an eligible active recertification lineage', () => {
        expect(phase14WorkspaceDecisionTypes('RECERTIFICATION', 'active'))
            .toEqual(['RECERTIFY']);
        expect(phase14WorkspaceDecisionTypes('RECERTIFICATION', 'suspended'))
            .toEqual([]);
        expect(phase14WorkspaceDecisionTypes('RECERTIFICATION', 'withdrawn'))
            .toEqual([]);
        expect(phase14WorkspaceDecisionTypes('RECERTIFICATION', 'replaced'))
            .toEqual([]);
        expect(phase14WorkspaceDecisionTypes('RECERTIFICATION', null))
            .toEqual([]);
        expect(phase14WorkspaceDecisionTypes('INITIAL_STAGE2', 'active'))
            .toEqual(['GRANT']);
        expect(phase14WorkspaceDecisionTypes('SURVEILLANCE', 'active'))
            .not.toContain('RECERTIFY');
    });

    it('allows replacement only from an active current certificate', () => {
        expect(canReplaceCertificateStatus('active')).toBe(true);
        for (const status of ['suspended', 'withdrawn', 'expired', 'replaced', null]) {
            expect(canReplaceCertificateStatus(status)).toBe(false);
        }
    });

    it.each(['AMEND', 'EXTEND_SCOPE', 'REDUCE_SCOPE'] as const)(
        '%s produces a new certificate version',
        (decisionType) => {
            expect(decisionRequiresCertificateVersion(decisionType)).toBe(true);
            expect(certificateActionForDecisionType(decisionType)).toBe('CREATE_NEXT_VERSION');
        },
    );

    it.each([
        ['SUSPEND', 'suspended'],
        ['RESTORE', 'active'],
        ['WITHDRAW', 'withdrawn'],
    ] as const)('%s is a status action targeting %s', (decisionType, status) => {
        expect(certificateActionForDecisionType(decisionType)).toBe('TRANSITION_STATUS');
        expect(statusTargetForDecisionType(decisionType)).toBe(status);
    });

    it('REFUSE creates no certificate', () => {
        expect(certificateActionForDecisionType('REFUSE')).toBe('NO_CERTIFICATE');
        expect(decisionRequiresCertificateVersion('REFUSE')).toBe(false);
    });

    it('derives conservative defaults for legacy clients', () => {
        expect(inferLegacyDecisionType({ auditType: 'stage2', decisionResult: 'approved' })).toBe('GRANT');
        expect(inferLegacyDecisionType({ auditType: 'surveillance2', decisionResult: 'approved' })).toBe('MAINTAIN');
        expect(inferLegacyDecisionType({ auditType: 'recertification', decisionResult: 'approved' })).toBe('RECERTIFY');
        expect(inferLegacyDecisionType({ auditType: 'stage2', decisionResult: 'rejected' })).toBe('REFUSE');
    });

    it('centralizes allowed status transitions and terminal states', () => {
        expect(canTransitionCertificateStatus('active', 'suspended')).toBe(true);
        expect(canTransitionCertificateStatus('active', 'replaced')).toBe(true);
        expect(canTransitionCertificateStatus('suspended', 'active')).toBe(true);
        expect(canTransitionCertificateStatus('replaced', 'active')).toBe(false);
        expect(canTransitionCertificateStatus('withdrawn', 'active')).toBe(false);
        expect(canTransitionCertificateStatus('expired', 'active')).toBe(false);
        expect(() => assertCertificateStatusTransition('expired', 'active'))
            .toThrow('expired -> active');
    });

    it('projects status decisions from the current certificate state', () => {
        expect(allowedStatusDecisionTypesForCertificateStatus('active')).toEqual([
            'SUSPEND',
            'WITHDRAW',
        ]);
        expect(allowedStatusDecisionTypesForCertificateStatus('suspended')).toEqual([
            'RESTORE',
            'WITHDRAW',
        ]);
        for (const terminalStatus of ['withdrawn', 'expired', 'replaced']) {
            expect(allowedStatusDecisionTypesForCertificateStatus(terminalStatus)).toEqual([]);
        }
    });

    it('adds Phase 1.3 actions without exposing invalid restoration', () => {
        expect(phase13WorkspaceDecisionTypes('SURVEILLANCE', 'active')).toEqual([
            'MAINTAIN',
            'AMEND',
            'EXTEND_SCOPE',
            'REDUCE_SCOPE',
            'SUSPEND',
            'WITHDRAW',
        ]);
        expect(phase13WorkspaceDecisionTypes('SURVEILLANCE', 'suspended')).toEqual([
            'RESTORE',
            'WITHDRAW',
        ]);
        expect(phase13WorkspaceDecisionTypes('SURVEILLANCE', 'withdrawn')).toEqual([]);
        expect(phase13WorkspaceDecisionTypes('INITIAL_STAGE2', null)).toEqual(['GRANT']);
    });

    it('identifies lifecycle status decisions separately from version decisions', () => {
        expect(isStatusDecisionType('SUSPEND')).toBe(true);
        expect(isStatusDecisionType('RESTORE')).toBe(true);
        expect(isStatusDecisionType('WITHDRAW')).toBe(true);
        expect(isStatusDecisionType('AMEND')).toBe(false);
    });
});
