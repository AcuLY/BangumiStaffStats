import type { PreferenceSummary } from './preference'

const fixed = (value: number) => value.toFixed(2)
const signed = (value: number) => `${value > 0 ? '+' : ''}${fixed(Object.is(value, -0) ? 0 : value)}`

export interface OverallScoreExplanationOptions {
	isGlobal: boolean
	seriesMode: boolean
	average?: number | null
	validCount?: number
	overall?: number | null
	subjectLabel?: string
}

export function overallScoreExplanation(options: OverallScoreExplanationOptions) {
	const unit = options.seriesMode ? '个系列' : '部作品'
	const countLabel = options.isGlobal ? '有效评分数' : '已评分数'
	const neutralUnit = options.seriesMode ? '个 5 分的中性系列' : '部 5 分的中性作品'
	const generic = `综合分 =（均分 × ${countLabel} + 5 分 × 5 ${unit}）÷（${countLabel} + 5）；相当于加入 5 ${neutralUnit}，避免样本很少时均分过度靠前`
	const validCount = Number(options.validCount || 0)
	const average = Number(options.average)
	const overall = Number(options.overall)
	if (!validCount || !Number.isFinite(average) || !Number.isFinite(overall)) return generic

	const countUnit = options.seriesMode ? '个' : '部'
	const evidenceLabel = options.seriesMode
		? options.isGlobal ? '有效评分系列' : '已评系列'
		: options.isGlobal ? '有效评分作品' : '已评分作品'
	const neutralLabel = options.seriesMode ? '中性系列' : '中性作品'
	return `${generic}\n${options.subjectLabel ?? '本人物'}：（均分 ${fixed(average)} × ${evidenceLabel} ${validCount} ${countUnit} + 5 分 × ${neutralLabel} 5 ${countUnit}）÷ ${validCount + 5} = 综合分 ${fixed(overall)}`
}

export interface PreferenceExplanationOptions {
	seriesMode: boolean
	summary?: PreferenceSummary | null
	subjectLabel?: string
}

export function preferenceExplanation(options: PreferenceExplanationOptions) {
	const unitLabel = options.seriesMode ? '系列' : '作品'
	const neutralEvidence = options.seriesMode ? '5 个偏差为 0 的中性系列' : '5 部偏差为 0 的中性作品'
	const generic = `${options.seriesMode ? '系列偏好 = 我的系列均分 − 全站系列均分' : '单作偏好 = 我的评分 − 全站评分'}
人物偏好分 = 平均偏差 × 有效${unitLabel}数 /（有效${unitLabel}数 + 5）；相当于加入 ${neutralEvidence}，避免样本很少时偏好分过度极端`
	const summary = options.summary
	if (!summary || !summary.effectiveEvidence || summary.mean === null || summary.score === null) return generic

	const evidence = summary.effectiveEvidence
	const evidenceDetail = options.seriesMode
		? `${evidence} 个有效系列，涉及 ${summary.comparableCount} 部作品`
		: `${evidence} 部有效作品`
	return `${generic}\n${options.subjectLabel ?? '本人物'}：平均偏差 ${signed(summary.mean)} × 样本权重 ${evidence}/${evidence + 5} = 偏好分 ${signed(summary.score)}（${evidenceDetail}）`
}
