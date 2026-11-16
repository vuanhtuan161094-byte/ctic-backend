# P.09 F.08 / F.16 / F.18 — Word/PDF visual QA and release gate (16 November 2026)

**Safety:** inspected user-provided P.09 RAR *read-only*, extracted F08/F16 legacy .doc files locally, inspected original F18 .docx files and converted previews with LibreOffice. No production, no database migration and no DEMO touched. This report is an observation, not an approval of legal templates.

## Actual original-form visual findings

| Form | Verified owner source | Original layout | Current CMP code-generated layout | Gate |
|---|---|---|---|---|
| F.08 Audit note | `F.08-P.09. Audit note.doc` (82,432 bytes), page 1 of 1 | CTIC green/red logo and contact header; centered bilingual title; client code; auditee/site/auditor/date in bordered metadata table; 3-column bordered notes grid, dotted horizontal writing rows; official F.08-P.09 version/date/page footer | Field mapping and paginated DOCX/PDF versioning function, but builder writes a new body using existing F03 package as ZIP shell; this **does not preserve the original F.08 header/footer/table positions and dotted rows**. | **FIELD CONTRACT PASS; ORIGINAL VISUAL FAIL/PENDING**, do not assert exact source |
| F.16 Recognized bodies | `F.16-P.09. List of recognized Certification Bodies.doc` (70,656 bytes), 1 page | CTIC green/red header; centered bilingual title; 3 bordered columns TT/No., Organizations, Content recognition; 6 blank entry rows; separate bordered two-signatory grid; F.16-P.09 version/date/page footer | Builder dynamically renders listed bodies, printable borders and repeated headers, and now resolves actual names instead of UUIDs; however **corporate header/footer and source typography/spacing are not exact**. This is an unsigned working form, not the approved source form. | **FIELD CONTRACT PASS; ORIGINAL VISUAL FAIL/PENDING** |
| F.18 Vietnamese | Original `F.18-P.09.01` SHA-256 `d74ba3d3a827f6578d04ce11e0e248b381b2d936ce2a47b73c62c59548f420c0` | Original: 2 pages, original logo and contractual clauses | Unsigned data cover adds one page; original text/signature blocks retained. Rendered with LibreOffice, 3 pages. Malformed ': ' cover title detected; fixed in `p09-f18-language-builder.cjs`. | **DRAFT WORD RENDER PASS**, original signatory/translation approval pending |
| F.18 Vietnamese–English | Original `F.18-P.09.02` SHA-256 `b3254eea3fca969a56e9d8d58d6c9a85752f320381e41920e8838ae84da9077a` | Source original contains legal clauses and authorized signature blocks | Unsigned cover + unchanged source legal body, rendered for preview | **DRAFT WORD RENDER PASS**, legal review pending |
| F.18 Vietnamese–Chinese | Original `F.18-P.09.03` SHA-256 `29347d5d9c2df454bceb91b9028a56e5980287b653f5888e04bc3afcf17eecf8` | **SOURCE DEFECT**: `word/footer3.xml` literally says **F.19-P.09** for page 1, while `word/footer2.xml` says `F.18-P.09.03` for page 3. Identified in source ZIP before any rendering. | Earlier draft renderer preserved this inconsistent original. Patched backend to report explicit `blocked_reason`, mark source unready, and reject its hash in generation; frontend warns the operator. | **BLOCKED — owner must correct, approve and re-pin the exact amended original SHA** |

## Technical checks performed

- LibreOffice previewed both legacy F.08/F.16 source .doc to PDF; each rendered as a one-page form. The original corporate header, bilingual colors, column widths, signature grid and footer were visually inspected.
- Converted F.18 vi, vi_en and vi_cn previews (using original verified DOCX bodies and a test-only data cover). XML readable and PDF render completed; page-count increase due to separate cover is intentional; source legal body is preserved by builder.
- Original VI-CN footer mismatches its form ID **before** generator edits, so automatic 'fix text and issue' is prohibited. The accepted control is **block and require owner-approved correction**.
- The F08/F16 XML generated from F03 shell was compared against the original layouts and found visually non-equivalent. An Excel/Word field or Jest unit test is **not** a substitute for original-form visual acceptance.
- Source-form PDF inspection is local QA evidence only, not evidence of a deployed SQL or production Word/PDF export.

## Required closeout (not completed)

1. Bring **exact controlled original F.08 and F.16 .doc / approved .docx revisions** into the document-template library, including CTIC corporate header and footer; adapt generation to populate the actual approved source grid rather than rebuilding from F03 ZIP shell; re-render and visually approve page-by-page.
2. Correct Vietnamese–Chinese F18 F.19 footer code in the **owner-controlled source**, review all bilingual legal clauses/signature authority, approve revised template in the controlled workflow, change pinned SHA and rerun dedicated tests.
3. Validate PDF converter availability and Word/PDF actual runtime on isolated staging, including 1-page and multiple-page tables, non-Latin font coverage, 1440/390 browser UI (browser viewport is not print-page QA).
4. Verify document links, actor audit, SQL readback and 2/2 isolated staging UAT before any real certificate lifecycle or contract release.
5. Browser/Quality exact-SHA verdicts must be recorded separately. The existence of an older green workflow does not close a later HEAD.

**Conclusion:** Current F08/F16 fields and F18 draft render are usable as **working source-code capabilities**, but **the original-form visual gate is NOT PASS**; F18 VI-CN release intentionally blocked. No final P09 compliance or production acceptance claimed.
