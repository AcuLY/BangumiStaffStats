## 1. Implementation
- [x] 1.1 Replace detail role/metadata pills and center grouped labels; update regressions.
- [x] 1.2 Replace co-star work metadata/selected identity pills and center grouped labels; update regressions.
- [x] 1.3 Audit all tag surfaces, align loading geometry, and document NTag ownership.
## 2. Acceptance
- [x] 2.1 Review actual diffs, run focused tests/typecheck/build/full gate and browser verification.
- [x] 2.2 Sync accepted tag ownership to frontend-accessibility.
- [ ] 2.3 Archive only after complete frontend gate passes.

## Evidence
- Primary rerun on Node 24.18.0: 5 files / 73 tests passed (person-detail components, adaptive roles, co-star components, candidate components, shared skeleton system). Typecheck + Vite production build passed; owned diff checks passed.
- Browser: 390/719/881/1200px person groups have 0px center deviation, role NTag height22, no role/metadata row overflow. Six-tag complete role tooltip uses NTag22 and opens/closes by keyboard. Co-star grouped evidence centers with 0px deviation; all ready work metadata uses NTag. Selected identity native button remains44px, fully labeled, with zero nested interactive controls and visible keyboard focus. Light/dark switching verified.
- Audit: PersonInspector and CoStarSurface already use NTag; AdaptiveRoleList/AdaptiveAppearanceList/PersonItemBrowser/CoStarWorkBrowser/CandidatePicker migrated. QueryEditor NDynamicTags internally imports/renders NTag; no custom query Tag renderer. Ordinals, plain role text, navigation and controls are not tags. Remaining 999px paint is NSkeleton loading shape. WorkCardsSkeleton role and metadata placeholders aligned to22px; grouped placeholders already22px.
- Full npm run check blocked by existing architecture inventory extras: src/app/AppViewport.vue, src/shared/components/ContentDivider.vue, tests/app/viewport.test.ts, vite-dev.err.log, vite-dev.out.log. These unrelated files were preserved. No backend/service/ref mutation, commit, push or deployment. Archive pending.
