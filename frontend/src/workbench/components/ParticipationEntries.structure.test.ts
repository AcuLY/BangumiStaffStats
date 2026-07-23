import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readWorkbenchFile = (relativePath: string) => readFileSync(
	new URL(relativePath, import.meta.url),
	'utf8',
)

const sharedParticipantsSource = readWorkbenchFile('./SharedWorkParticipants.vue')
const participationDomainSource = readWorkbenchFile('../domain/participationEntries.ts')
const dashboardSource = readWorkbenchFile('./AnalysisDashboard.vue')
const inspectorSource = readWorkbenchFile('./PersonInspector.vue')
const subjectWorkListSource = readWorkbenchFile('./SubjectWorkList.vue')
const participantBodySource = readWorkbenchFile('./AdaptiveParticipantBody.vue')
const adaptiveRoleSource = readWorkbenchFile('./AdaptiveRoleList.vue')
const roleTagSource = readWorkbenchFile('./CharacterRoleTag.vue')
const participantStyles = readWorkbenchFile('../styles/modules/shared-work-participants.css')
const subjectWorkStyles = readWorkbenchFile('../styles/modules/subject-work-list.css')

describe('co-star participation identity structure', () => {
	it('keeps participation identity rendering separate from work-name search', () => {
		expect(sharedParticipantsSource).toContain('buildParticipationEntries,')
		expect(sharedParticipantsSource).toContain('aggregateParticipationEntries,')
		expect(dashboardSource).not.toContain("import { buildParticipationEntries } from '../domain/participationEntries'")
		expect(dashboardSource).toContain('searchTerms: (subject) => [')
		expect(dashboardSource).toContain('...localizedNameSearchTerms(subject)')
		expect(dashboardSource).toContain('...(subject.series?.members.flatMap((member) => localizedNameSearchTerms(member)) ?? [])')
		expect(dashboardSource).not.toContain('entry.searchTerms')
		expect(sharedParticipantsSource).not.toContain('声优 ·')
		expect(dashboardSource).not.toContain('声优 ·')
	})

	it('keeps actual positions in co-star cards while using the generic participation label', () => {
		expect(sharedParticipantsSource).toContain('for (const positionId of [...new Set(positionIds.map(Number))])')
		expect(sharedParticipantsSource).toContain('positionIds: [positionId]')
		expect(sharedParticipantsSource).not.toContain('voiceActorPositionIds')
		expect(sharedParticipantsSource).not.toContain(".filter((entry) => entry.kind === 'character')")
		expect(participationDomainSource).toContain("entry.key !== 'position:102'")
		expect(sharedParticipantsSource).toContain('aggregateParticipationEntries(occurrences, Boolean(activeSeries.value))')
		expect(participantBodySource).toContain('const participantEntries = computed(')
		expect(participantBodySource).not.toContain('entry-noun="配音角色"')
	})

	it('keeps ranking work cards limited to real voice roles and suppresses empty role facts', () => {
		expect(inspectorSource).toContain('if (!person.value || !isVoiceActorQuery.value) return []')
		expect(inspectorSource).toContain('workbench.positionSubjectIds(person.value, 102)')
		expect(inspectorSource).toContain('workbench.personSubjectRoles(person.value!, subjectId, 102)')
		expect(inspectorSource).toContain('characterCreditKey(role)')
		expect(inspectorSource).toContain('characterRoleLabelPriority(entry.label) > characterRoleLabelPriority(existing.label)')
		expect(inspectorSource).not.toContain('positionLabel(positionId)')
		expect(inspectorSource).toContain('const hasRoleSummary = (subject: Subject) => roleSummary(subject).length > 0')
		expect(inspectorSource).toContain('role-label="配音角色"')
		expect(inspectorSource).toContain(':show-role="hasRoleSummary"')
		expect(subjectWorkListSource).toContain('showRole?: (subject: Subject) => boolean')
		expect(subjectWorkListSource).toContain('const roleVisible = (subject: Subject, hasRoleSlot: boolean) => hasRoleSlot')
		expect(subjectWorkListSource).toContain('&& (props.showRole?.(subject) ?? true)')
		expect(subjectWorkListSource).toContain('v-if="roleVisible(subject, Boolean($slots.role))" class="subject-work-row__role-fact"')
	})

	it('shows each available series member original name at a secondary size even when names match', () => {
		expect(subjectWorkListSource).toContain("const seriesMemberOriginalName = (member: SeriesMember) => String(member.name ?? '').trim()")
		expect(subjectWorkListSource).not.toContain('originalName !== seriesMemberName(member)')
		expect(subjectWorkListSource).toContain('class="subject-work-row__series-member-original"')
		expect(subjectWorkStyles).toMatch(/\.subject-work-row__series-member-name\s*\{[^}]*font-size:\s*var\(--text-body\);/s)
		expect(subjectWorkStyles).toMatch(/\.subject-work-row__series-member-original\s*\{[^}]*font-size:\s*var\(--text-caption\);/s)
	})

	it('places the series coverage summary at the primary-colored top-right metadata position', () => {
		expect(subjectWorkStyles).toMatch(/\.subject-work-row__copy > \.subject-work-row__series-summary\s*\{[^}]*grid-area:\s*collection;[^}]*align-self:\s*start;[^}]*justify-self:\s*end;[^}]*color:\s*var\(--primary\);/s)
	})

	it('shows the shared tooltip only when a series member name is truncated', () => {
		expect(subjectWorkListSource).not.toContain('WorkbenchTooltip')
		expect(subjectWorkListSource).toContain('element.scrollWidth > element.clientWidth')
		expect(subjectWorkListSource).toContain('<n-tooltip')
		expect(subjectWorkListSource).toContain('trigger="manual"')
		expect(subjectWorkListSource).toContain('style="max-width: min(336px, calc(100dvw - 72px));"')
		expect(subjectWorkListSource).toContain('content-class="workbench-tooltip-content"')
		expect(subjectWorkListSource).not.toContain(':title="seriesMemberOriginalName(member)"')
		expect(subjectWorkListSource).not.toContain(':title="seriesMemberTitle(member)"')
	})

	it('does not present representative-entry collection metadata as series metadata', () => {
		expect(subjectWorkListSource).toContain('v-if="!workbench.query.isGlobal && !subject.series" class="subject-work-row__collection-meta"')
	})

	it('uses the same complete participation tags before and after series merging', () => {
		expect(participantBodySource).toContain('name: entry.label')
		expect(participantBodySource).toContain('tagOnly: true')
		expect(participantBodySource).toContain('count: entry.count')
		expect(participantBodySource).not.toContain("entry.kind === 'character'")
		expect(participantBodySource).not.toContain('entry.displayName')
		expect(participantBodySource).not.toContain('entry.roleLabel')
		expect(adaptiveRoleSource).toContain('tagOnly?: boolean')
		expect(adaptiveRoleSource).not.toContain('nameTag')
		expect(adaptiveRoleSource).toContain('count?: number')
		expect(adaptiveRoleSource).toContain('entry.label ?? entry.name')
		expect(adaptiveRoleSource).toContain(':label="displayEntries[entryIndex].name"')
		expect(adaptiveRoleSource).toContain(':count="displayEntries[entryIndex].count"')
		expect(adaptiveRoleSource).toContain(':count="entry.count"')
		expect(adaptiveRoleSource).toContain("const fullRoleLabel = computed(() => displayEntries.value.map(entryText).join('；'))")
	})

	it('explains series participation counts once at the card-level summary', () => {
		expect(subjectWorkListSource).toContain("import AppIcon from './AppIcon.vue'")
		expect(subjectWorkListSource).toContain('v-if="subject.series && $slots.participants"')
		expect(subjectWorkListSource).toContain(':show="visibleSeriesInfoSubjectId === subject.id"')
		expect(subjectWorkListSource).toContain('trigger="manual"')
		expect(subjectWorkListSource).toContain('@mouseenter="showSeriesInfoTooltip(subject.id)"')
		expect(subjectWorkListSource).toContain('@mouseleave="hideSeriesInfoTooltip(subject.id)"')
		expect(subjectWorkListSource).toContain('@focus="showSeriesInfoTooltip(subject.id)"')
		expect(subjectWorkListSource).toContain('@blur="hideSeriesInfoTooltip(subject.id)"')
		expect(subjectWorkListSource).toContain('@click.stop="showSeriesInfoTooltip(subject.id)"')
		expect(subjectWorkListSource).toContain('@keydown.esc.stop.prevent="hideSeriesInfoTooltip(subject.id)"')
		expect(subjectWorkListSource).toContain('aria-label="系列参与身份数量说明：参与身份标签末尾的数字表示该人物以此身份参与的系列内作品数"')
		expect(subjectWorkListSource).toContain('<AppIcon name="info" :size="16" />')
		expect(subjectWorkListSource).toContain('参与身份标签末尾的数字表示该人物以此身份参与的系列内作品数')
		expect(subjectWorkStyles).toMatch(/\.subject-work-row__copy > \.subject-work-row__series-summary\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*gap:\s*2px;/s)
	})

	it('keeps the compact index with identity on the left and participation roles on the right', () => {
		expect(sharedParticipantsSource).toContain("'shared-work-participant--series': Boolean(activeSeries)")
		expect(participantBodySource).toContain("'shared-work-participant__body--series': Boolean(support)")
		expect(participantStyles).toMatch(/\.shared-work-participant\s*\{[^}]*grid-template-columns:\s*16px minmax\(0, 1fr\);/s)
		expect(participantStyles).toMatch(/\.shared-work-participant__index\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;[^}]*font-size:\s*var\(--text-caption\);/s)
		expect(participantStyles).toMatch(/\.shared-work-participant__body--series\s*\{[^}]*grid-template-columns:\s*minmax\(72px, 2fr\) minmax\(0, 3fr\);/s)
		expect(participantStyles).toMatch(/\.shared-work-participant__body--series \.shared-work-participant__identity\s*\{[^}]*display:\s*grid;[^}]*gap:\s*1px;/s)
		expect(roleTagSource).toContain('count?: number')
		expect(roleTagSource).not.toContain('flexible')
		expect(roleTagSource).toContain('`${props.label}，参与 ${displayCount.value} 部`')
		expect(roleTagSource).toContain('class="character-role-tag__count"')
		expect(roleTagSource).toMatch(/\.character-role-tag__count\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s)
	})

	it('uses real tag measurements in every mode and keeps the two-row overflow contract', () => {
		expect(adaptiveRoleSource).not.toContain("if (props.mode === 'co-star')")
		expect(adaptiveRoleSource).not.toContain('.adaptive-role-list--co-star .adaptive-role-list__row--pair')
		expect(adaptiveRoleSource).toContain('maxRows: MAX_VISIBLE_ROWS')
		expect(participantBodySource).toContain("querySelectorAll<HTMLElement>('[data-role-measure]')")
		expect(participantBodySource).toContain('entry.getBoundingClientRect().width')
	})

	it('packs complete co-star tags compactly without changing paired ranking rows', () => {
		expect(adaptiveRoleSource).toContain("props.mode === 'co-star'")
		expect(adaptiveRoleSource).toContain('displayEntries.value.every(entry => entry.tagOnly)')
		expect(adaptiveRoleSource).toContain('packCompactOverflowRows')
		expect(adaptiveRoleSource).toContain("'adaptive-role-list--compact-tags': compactTagMode")
		expect(adaptiveRoleSource).toContain("'adaptive-role-list__row--pair': !compactTagMode")
		expect(adaptiveRoleSource).toMatch(/\.adaptive-role-list--compact-tags \.adaptive-role-list__row\s*\{[^}]*display:\s*flex;[^}]*gap:\s*var\(--space-1\);/s)
		expect(adaptiveRoleSource).toMatch(/\.adaptive-role-list--compact-tags \.adaptive-role-list__copy\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*100%;/s)
	})

	it('bounds and vertically centers long tags while keeping the established four-point scale', () => {
		expect(roleTagSource).toContain(':title="accessibleLabel"')
		expect(roleTagSource).toMatch(/\.character-role-tag\s*\{[^}]*align-self:\s*center;[^}]*max-width:\s*100%;/s)
		expect(roleTagSource).toMatch(/\.character-role-tag__text\s*\{[^}]*display:\s*block;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s)
		expect(participantStyles).toMatch(/\.shared-work-participant__body\s*\{[^}]*gap:\s*var\(--space-1\) var\(--space-2\);/s)
	})
})
