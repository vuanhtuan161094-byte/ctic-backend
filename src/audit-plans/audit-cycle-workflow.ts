export function dossierKeyForAuditCycle(eventType?: string | null): string {
    const normalized = (eventType ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.includes('surveillance2')) return 'surveillance_2';
    if (normalized.includes('surveillance1') || normalized === 'surveillance') return 'surveillance_1';
    if (normalized.includes('recert')) return 'recertification';
    return 'initial_certification';
}

export function auditCycleBusinessLabel(eventType?: string | null): string {
    const dossierKey = dossierKeyForAuditCycle(eventType);
    if (dossierKey === 'surveillance_1') return 'GS1';
    if (dossierKey === 'surveillance_2') return 'GS2';
    if (dossierKey === 'recertification') return 'Tái chứng nhận';
    const normalized = (eventType ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.includes('stage1')) return 'Đánh giá GĐ1';
    if (normalized.includes('stage2')) return 'Đánh giá GĐ2';
    return 'Chứng nhận lần đầu';
}

export function businessAuditTaskTitle(
    eventType: string | null | undefined,
    organizationName: string | null | undefined,
    actionCode: string,
): string {
    const actionLabels: Record<string, string> = {
        UPDATE_INFORMATION: 'Cần cập nhật thông tin',
        REVIEW_CHANGE: 'Cần xem xét thay đổi',
        APPOINT_TEAM: 'Cần chỉ định đoàn',
        PLAN_AUDIT: 'Cần lập kế hoạch',
        EXECUTE_AUDIT: 'Cần thực hiện đánh giá',
        COMPLETE_REPORT: 'Cần hoàn thiện báo cáo',
    };
    return `${auditCycleBusinessLabel(eventType)} · ${organizationName ?? 'Khách hàng'} — ${actionLabels[actionCode] ?? 'Cần xử lý'}`;
}

export function hasPreparedAuditPlan(formData?: string | null): boolean {
    if (!formData?.trim()) return false;
    try {
        const data = JSON.parse(formData) as {
            detailed_schedule?: unknown[];
            document_generation?: { schedule_rows?: unknown[] };
        };
        return Boolean(
            data.detailed_schedule?.length
            || data.document_generation?.schedule_rows?.length,
        );
    } catch {
        return false;
    }
}
