# CMP P.09 — F.08 / F.16 / F.18 controlled source closeout and acceptance checklist
Date: 2026-11-16. Branch: `feature/ux-fix-batch01`. No production, no DEMO or staging database touched; migration is committed but **NOT APPLIED**.

## F.08 — audit notes
- Authorized PLAN editor stores F.08 clause/content/finding rows and an atomic actor audit event, with document-generation versioned Word/PDF. Actor/resource permission remains part of the existing PLAN scope.
- Derived audit-note Word output has the form's functional fields, not a visually approved pixel-exact reconstruction. Do not mark source-form appearance signed off until visual QA of the source .doc.
- The F.08 notes do **not** by themselves close nonconformities or substitute F.10 corrective action documents.

## F.16 — recognized certification bodies
- Approved list with independent ADMIN decision, version, actor, role controls, audit log. No automatic manday reduction or recognition/transfer of external certification.
- After approval, ADMIN/STAFF may generate a **marked UNSIGNED** F.16 Word/PDF with original bilingual field arrangement, including No., Organizations, Content recognition, and Prepared by / Approved by / Date / Signature.
- The F.16 form is officially issued **only** following an externally signed, current `signed_scan`, stored under `entity_type=p09_f16`, `document_type=recognized_certification_bodies_f16`, with valid SHA-256, and an independent ADMIN attestation. The attesting user must not be the preparer nor file uploader. Decision recorded through `workflow_approvals` and `audit_logs` in a transaction. New signed-scan version invalidates previous current issuance status.
- Endpoints: `POST /p09/recognized-certification-bodies/:id/render?format=docx|pdf`; `GET /:id/issue-status`; `POST /:id/issue`. Existing frontend Documents workspace includes export/upload/issue controls.
- **Known limitation:** F.16 generation reproduces original fields, not exact typography/line-height/layout of the legacy .doc. Must be checked visually against the owner-provided F.16 .doc; approval of version by staff is not a legal signature.
- New table `p09_recognized_certification_bodies` requires approved isolated SQL staging migration, and real actor/SoD UAT before release.

## F.18 — three controlled originals and hash-locked source
Original owner-provided files (2026-11-16) were inspected and SHA-256 calculated from the source bytes:

| Language | Controlled template code | Required SHA-256 |
|---|---|---|
| Vietnamese | `F.18-P.09.01` | `d74ba3d3a827f6578d04ce11e0e248b381b2d936ce2a47b73c62c59548f420c0` |
| Vietnamese-English | `F.18-P.09.02` | `b3254eea3fca969a56e9d8d58d6c9a85752f320381e41920e8838ae84da9077a` |
| Vietnamese-Chinese | `F.18-P.09.03` | `29347d5d9c2df454bceb91b9028a56e5980287b653f5888e04bc3afcf17eecf8` |

- Template Manager must import these **exact original DOCX bytes** as respective controlled template versions; controlled revision must reach `EFFECTIVE`, with the corresponding series `ACTIVE`. The existing document-control workflow handles role, history and effectiveness; no unaudited bypass of approval.
- `GET /certification-agreements/language-sources` returns three source-readiness flags; `POST /certification-agreements/:id/prepare-language?language=vi|vi_en|vi_cn&format=docx|pdf` creates only an **UNSIGNED draft** from the exact effective source document.
- The renderer appends a separate, typed cover containing agreement number, customer, representative, title/address and proposed date, then reproduces the **original legal paragraphs and signature tables unmodified**. It deliberately does not invent/change substantive clauses, party signatures or CTIC director authority.
- Source hash checked against (1) configured owner-supplied original hash, (2) controlled file metadata SHA and (3) **physical source bytes** at rendering time. Output is stored in versioned document_files with actor audit and source version+SHA provenance.
- A **completed sign-ready** agreement still requires human verification of original placeholders, currently named signatories, addresses, signature blocks and all three legal translations. The cover is not a legal substitution for fields in the untouched source body; never issue the unsigned draft as a signed contract. F.18 legal signing is controlled by both parties, not automatic software approval.
- The existing signed-scan evidence and independent ADMIN SHA attestation are reused for F.18; a typed date is insufficient proof of signatures.

## Required independent staging gates, NOT RUN
1. DB identity `SELECT DB_NAME()` must equal `CTIC_Certification_P09_test`. Backup and operator approval required; do not use production `CTIC_Certification` or `CTIC_CMP_DEMO_2026`.
2. Apply new F16 migration only to isolated staging, verify Prisma schema drift and DB index.
3. Execute F16 role/SoD/duplicate/revision issuance tests with two real accounts, signed scan, SHA, historical invalidation; confirm one actor cannot prepare+approve or upload+issue.
4. Import each exact F18 source into controlled Template Manager, approve, mark effective, verify three expected hashes and full preservation of original legal paragraphs and signature tables in three exports. Cross-customer and disabled/missing-source negative tests.
5. Inspect exported Word/PDF actual 1440 desktop/390 mobile; compare F.08/F.16/F.18 print versions against the original files. Signing parties and languages must be approved by owner.
6. Verify old versions immutable, tamper rejection, SQL readback of `document_files`, `workflow_approvals`, `audit_logs`; complete 2/2 staging UAT and owner decision.
7. Confirm **exact final backend/frontend SHA** with Quality CI and Browser CI. Browser green on a previous SHA or a retry-only result does not qualify as final-HEAD PASS.

## Status
Code paths and source/actor gates are implemented. **No production approval, no legal signature attestation, no exact visual sign-off, no SQL staging acceptance is claimed in this document.**
