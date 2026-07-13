export const BANGUMI_API_BASE = 'https://search.bgmss.fun/proxy'

export type BangumiImageResource = 'subjects' | 'persons' | 'characters'
export type BangumiImageType = 'small' | 'grid' | 'large' | 'medium' | 'common'

export function bangumiImageUrl(
	resource: BangumiImageResource,
	id: number | string,
	type: BangumiImageType = 'large',
) {
	return `${BANGUMI_API_BASE}/v0/${resource}/${encodeURIComponent(String(id))}/image?type=${type}`
}
