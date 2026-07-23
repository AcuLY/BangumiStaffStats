import { describe, expect, it } from 'vitest'
import {
	localizedNameSearchTerms,
	localizedNameSearchValue,
	matchesLocalizedNameSearch,
} from './nameSearch'

const entity = {
	id: 5119,
	name: '日笠陽子',
	nameCN: '日笠阳子',
	displayName: '展示名',
	aliases: ['ひかさ ようこ', 'Yoko Hikasa'],
	tags: ['声优'],
	roleLabels: ['主角'],
	relatedNames: ['来源作品'],
}

describe('localized name search', () => {
	it('exposes only the Chinese and original names as searchable terms', () => {
		expect(localizedNameSearchTerms(entity)).toEqual(['日笠阳子', '日笠陽子'])
		expect(localizedNameSearchValue(entity)).toBe('日笠阳子')
		expect(localizedNameSearchValue({ name: '原文名' })).toBe('原文名')
	})

	it('matches Chinese and original names with normalized punctuation', () => {
		expect(matchesLocalizedNameSearch(entity, '日笠阳')).toBe(true)
		expect(matchesLocalizedNameSearch(entity, '陽子')).toBe(true)
		expect(matchesLocalizedNameSearch(entity, '日笠 · 陽子')).toBe(true)
	})

	it('does not match aliases, display names, IDs, tags, roles, or related names', () => {
		for (const query of ['Yoko', '展示名', '5119', '声优', '主角', '来源作品']) {
			expect(matchesLocalizedNameSearch(entity, query)).toBe(false)
		}
	})

	it('keeps an empty search inclusive', () => {
		expect(matchesLocalizedNameSearch(entity, '   ')).toBe(true)
	})
})
