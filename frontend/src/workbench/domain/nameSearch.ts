export interface LocalizedNameFields {
	name?: string
	nameCN?: string
}

const compactNameSearch = (value: unknown) => String(value ?? '')
	.normalize('NFKC')
	.toLocaleLowerCase('zh-CN')
	.replace(/[\s·・_-]/g, '')

export const localizedNameSearchTerms = (item: LocalizedNameFields) => [
	item.nameCN,
	item.name,
]

export const localizedNameSearchValue = (item: LocalizedNameFields) =>
	localizedNameSearchTerms(item)
		.map((name) => String(name ?? '').trim())
		.find(Boolean) ?? ''

export const matchesLocalizedNameSearch = (
	item: LocalizedNameFields,
	search: string,
) => {
	const query = compactNameSearch(search.trim())
	if (!query) return true
	return localizedNameSearchTerms(item)
		.some((name) => compactNameSearch(name).includes(query))
}
