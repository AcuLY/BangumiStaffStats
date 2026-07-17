import type {
	CharacterCredit,
	CharacterCreditAppearance,
	PersonRole,
	Subject,
} from '../types'

const ROLE_TYPE_LABELS: Record<number, string> = {
	1: '主角',
	2: '配角',
	3: '客串',
	4: '其他',
}

const ROLE_LABEL_ALIASES: Record<string, string> = {
	主役: '主角',
	主角: '主角',
	配角: '配角',
	客串: '客串',
	其他: '其他',
	闲角: '其他',
}

const compactIdentity = (value: unknown) => String(value ?? '')
	.normalize('NFKC')
	.trim()
	.toLocaleLowerCase('zh-CN')
	.replace(/[\s·・_-]/g, '')

const firstText = (...values: unknown[]) => values
	.map((value) => String(value ?? '').trim())
	.find(Boolean) ?? ''

export const characterRoleLabel = (role: Pick<PersonRole, 'roleType' | 'roleLabel'>) => {
	const rawLabel = String(role.roleLabel ?? '').trim()
	return (ROLE_TYPE_LABELS[Number(role.roleType)]
		?? ROLE_LABEL_ALIASES[rawLabel]
		?? rawLabel) || '其他'
}

export const characterRolePriority = (role: Pick<PersonRole, 'roleType' | 'roleLabel'>) => {
	const label = characterRoleLabel(role)
	return ({ 主角: 4, 配角: 3, 客串: 2, 其他: 1 })[label] ?? 1
}

export const characterCreditKey = (role: PersonRole) => {
	const characterId = Number(role.characterId)
	if (Number.isInteger(characterId) && characterId > 0) return `character:${characterId}`
	const nameKey = [role.nameCN, role.name, role.displayName]
		.map(compactIdentity)
		.filter(Boolean)
		.join('|')
	return nameKey ? `name:${nameKey}` : `unknown:${Number(role.roleType) || 0}:${Number(role.sortOrder) || 0}`
}

export const characterCreditName = (credit: Pick<CharacterCredit, 'displayName' | 'nameCN' | 'name' | 'characterId'>) =>
	firstText(credit.displayName, credit.nameCN, credit.name, credit.characterId ? `角色 ${credit.characterId}` : '未命名角色')

export const characterCreditSecondaryName = (credit: Pick<CharacterCredit, 'displayName' | 'nameCN' | 'name'>) => {
	const primary = characterCreditName(credit)
	const name = String(credit.name ?? '').trim()
	const nameCN = String(credit.nameCN ?? '').trim()
	if (name && nameCN) return compactIdentity(primary) === compactIdentity(name) ? nameCN : name
	return [name, nameCN, credit.displayName]
		.map((value) => String(value ?? '').trim())
		.find((value) => Boolean(value) && compactIdentity(value) !== compactIdentity(primary)) ?? ''
}

export const countUniqueCharacterRoles = (roles: Iterable<PersonRole>) => {
	const keys = new Set<string>()
	for (const role of roles) keys.add(characterCreditKey(role))
	return keys.size
}

export function buildCharacterCredits(
	subjects: Subject[],
	rolesForSubject: (subject: Subject) => PersonRole[],
): CharacterCredit[] {
	type MutableCredit = Omit<CharacterCredit, 'appearances' | 'roleLabels' | 'subjectCount'> & {
		appearancesBySubject: Map<number, CharacterCreditAppearance>
		labelsByPriority: Map<string, number>
	}

	const credits = new Map<string, MutableCredit>()

	for (const subject of subjects) {
		for (const role of rolesForSubject(subject)) {
			const key = characterCreditKey(role)
			const characterId = Number(role.characterId)
			const displayName = firstText(role.displayName, role.nameCN, role.name, characterId > 0 ? `角色 ${characterId}` : '未命名角色')
			const existing = credits.get(key) ?? {
				key,
				characterId: Number.isInteger(characterId) && characterId > 0 ? characterId : undefined,
				displayName,
				name: role.name,
				nameCN: role.nameCN,
				appearancesBySubject: new Map<number, CharacterCreditAppearance>(),
				labelsByPriority: new Map<string, number>(),
				primaryRolePriority: 0,
			}
			const roleLabel = characterRoleLabel(role)
			const priority = characterRolePriority(role)
			const appearance: CharacterCreditAppearance = {
				subject,
				roleType: role.roleType,
				roleLabel,
				sortOrder: Number(role.sortOrder) || 0,
			}
			const previousAppearance = existing.appearancesBySubject.get(Number(subject.id))
			if (!previousAppearance || priority > characterRolePriority(previousAppearance)) {
				existing.appearancesBySubject.set(Number(subject.id), appearance)
			}
			existing.labelsByPriority.set(roleLabel, Math.max(priority, existing.labelsByPriority.get(roleLabel) ?? 0))
			existing.primaryRolePriority = Math.max(existing.primaryRolePriority, priority)
			credits.set(key, existing)
		}
	}

	return [...credits.values()]
		.map(({ appearancesBySubject, labelsByPriority, ...credit }): CharacterCredit => {
			const appearances = [...appearancesBySubject.values()]
			const roleLabels = [...labelsByPriority]
				.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'))
				.map(([label]) => label)
			return {
				...credit,
				appearances,
				roleLabels,
				subjectCount: appearances.length,
			}
		})
		.sort((left, right) => right.primaryRolePriority - left.primaryRolePriority
			|| Math.min(...left.appearances.map((appearance) => appearance.sortOrder))
				- Math.min(...right.appearances.map((appearance) => appearance.sortOrder))
			|| characterCreditName(left).localeCompare(characterCreditName(right), 'zh-CN', { numeric: true })
			|| left.key.localeCompare(right.key))
}
