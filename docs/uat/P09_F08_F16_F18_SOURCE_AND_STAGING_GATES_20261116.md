# CMP P.09 — F.08, F.16, F.18 source implementation and acceptance gates (2026-11-16)

**Scope:** Existing `feature/ux-fix-batch01` branches. No Codex, no creation/merging of branches, no production/DEMO write, no migration applied. The owner-provided P.09 v1.3 and its original Word forms were inspected locally; source originals are not reproduced here.

## Exact original-form crosswalk
| Form | Original source / procedural meaning | Implemented source | Controlled limits |
| --- | --- | --- | --- |
| F.08 audit notes | Client code, auditee, audit site, auditor, date; per-row clause, contents, findings; P.09 audit execution | `audit-documents` existing PLAN resource gate; `audit_note_rows` in `audit_plans.form_data.document_generation`; versioned DOCX/PDF via `p09-f08-builder.cjs` and existing `document_files`; edit form in `AuditDocumentCenterModal`; dedicated changed-row audit log in same DB transaction | Not a substitute for F.10 NC/CAP or F.11 technical review. Programmatic DOCX matches original fields, not certified exact pixel fidelity. Owner visual form approval pending |
| F.16 recognized organizations | Approved *certification bodies*, recognition scope; prepared/approved by; P.09 recognition influences possible audit-duration consideration | SQL model + migration `20261116083000_p09_f16_recognized_bodies` (NOT EXECUTED); `p09-f16` list, draft, independent ADMIN approval and audit events; visible only to internal ADMIN/STAFF documents workspace | An approved F.16 **does not** itself authorize reduction of mandays or accept external certifications. The legally signed master form/export, owner authority mapping and attachment to manday decision are OPEN |
| F.18 agreement | P.09 §4.1.3: certification department prepares F.18 and submits for General Director and customer authorized signer; original VN / EN / CN variants and contractual responsibilities | Existing `certification_agreements` and `CommercialDocumentsPanel` signed-scan/version history reused. New actor-attributed create+audit transaction; independent ADMIN evidence check requires current exact signed_scan ID + SHA-256, separate uploader, substantive written verification; history stored in `workflow_approvals` and `audit_logs`; UI indicates verified/unverified status | An uploaded scan or internal reviewer is **not** an invented CEO/customer cryptographic/legal signature. Customer signatory authority, bilingual form issuance and original signed/approved copy still require separate evidence and owner sign-off |

## API and roles

- F.08 `GET /audit-documents/plan/:planId`: original PLAN scoped authorization; `PATCH /audit-documents/plan/:planId/data`: ADMIN/STAFF/COORDINATOR/LEAD_AUDITOR/AUDITOR + `documents.manage` + resource access. `POST /audit-documents/plan/:planId/generate?documentType=audit_note_f08&format=docx|pdf` reuses document versioning, logged actor and protected document resource checks.
- F.16 `GET /p09/recognized-certification-bodies`: ADMIN/STAFF `documents.read`; `GET /approved`: internal roles including COORDINATOR, read-only; `POST /`: ADMIN/STAFF `documents.manage`; `POST /:id/approve`: ADMIN `documents.manage`; preparer cannot approve same version. No CREATE/APPROVE permission for CUSTOMER, AUDITOR, SALES.
- F.18 `GET /certification-agreements/:id/evidence-status`: internal `contracts.read`; `POST /certification-agreements/:id/verify-evidence`: ADMIN + `contracts.manage`, independently checked exact signed_scan from `document_files` and uploader; no automatic certificate/status effect. Existing `POST /certification-agreements`: ADMIN/STAFF/SALES + `contracts.manage`, signed proof is **not** inferred from `sign_date`.

## Runtime staging UAT matrix (NOT RUN)

**Staging database precondition:** verify `SELECT DB_NAME()` = `CTIC_Certification_P09_test`. Never use production/`CTIC_Certification`/`CTIC_CMP_DEMO_2026`. Obtain approved deployment of new F16 migration **only** in isolated staging, with backup and rollback plan, before testing. Obtain runtime SHA/actor identity and redacted SQL proof.

1. **F08-01:** Authenticated auditor edits and saves clauses/content/findings; readback survives reload, exact author audit log, source PLAN correct; cross-project/guest/customer denies.
2. **F08-02:** Required strings and max row length/200 rows fail closed; 1 edit transaction rollback test; two docs in DOCX and PDF with exact captured snapshot, XML-valid and visible 1440/390; old version not overwritten; F.10 NC/CAP unchanged.
3. **F16-01:** Initial draft, duplicate names/invalid scope rejected, STAFF prepare; ADMIN different individual approve; same actor and CUSTOMER denied; latest approved readback and immutable version history.
4. **F16-02:** Attempt concurrent duplicate draft, approval of stale/wrong revision, unauthorized manday reduction without independent review; verify roles, protected list and `audit_logs`; independently inspect the operator-signed F16 source document; no automatic reduction.
5. **F18-01:** Create agreement with matching contract/customer and actor; cross-customer contract rejected; ensure no signed proof inferred from entered sign_date.
6. **F18-02:** Upload actual approved-copy F18 scan; independent ADMIN verifies current file ID/SHA, rejects same uploader, missing digest, repeat approval; replacement scan invalidates previous verifier attestation; audit history remains.
7. **F18-03:** Inspect original VN, VN-EN, VN-CN agreement clause variants, General Director / authorized customer signatures and signatory evidence; check absence of unauthorized blanket certificate issuance.
8. **P09-REGRESSION:** Real staging role/SoD negatives, full original P.09 lifecycle, repeatable SQL **2/2**, full Browser/Portal and historical document version tests.

For each scenario: attach redacted actor/role, endpoint/status, SQL record IDs, audit event, document version+SHA, screenshots desktop/mobile, denied-role proof and time. **DO NOT mark SQL UAT PASS based on Jest or Playwright fixtures.**

## Outstanding source and external gates

- **F.08:** original exact-layout approval (form regenerated from fields rather than importing original DOC), full document and document-file download integration staging proof.
- **F.16:** SQL migration not executed, official issued/signed F.16 Word/PDF and recognition evidence, owner authorization of independent ADMIN reviewer, controlled automatic visibility across manday calculations (must remain blocked until approved).
- **F.18:** original trilingual F18 contract package and independently documented legal signature/authority verification; no cryptographic signature introduced under owner exclusion.
- **Production:** audit, restore, p95, SQL 2/2, owner acceptance and production release all BLOCKED. Do not touch DEMO/Gate A.

**CI evidence rule:** Record exact frontend/backend SHAs and successful Quality and full Browser logs in a separate checkpoint after the last source commit. This document does not itself attest results.
