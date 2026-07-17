import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url))
const styleExtensions = new Set(['.css', '.less', '.scss'])
const naiveStylePattern = /(?:^|[^\w-])\.n-[\w-]+|--n-[\w-]+/
const intrinsicStylePattern = /(?:^|;)\s*(?:height|min-height|max-height|padding(?:-[\w-]+)?|font-size|line-height)\s*:/
const intrinsicInlineStylePattern = /\b(?:height|minHeight|maxHeight|padding(?:Block|Inline|Top|Right|Bottom|Left)?|fontSize|lineHeight)\s*[:=]/
const sizedThemeTokenPattern = /\b(?:height|fontSize|itemSize|padding)(?:Tiny|Small|Medium|Large|Huge)\s*:/
const sizeControlledComponents = new Set([
	'button',
	'card',
	'checkbox',
	'data-table',
	'date-picker',
	'dynamic-tags',
	'input',
	'input-number',
	'pagination',
	'radio',
	'radio-group',
	'select',
	'switch',
	'tag',
])

const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
	const path = join(directory, entry.name)
	return entry.isDirectory() ? sourceFiles(path) : [path]
})

const styleSources = (path, source) => {
	if (styleExtensions.has(extname(path))) return [{ lineOffset: 0, source }]
	if (extname(path) !== '.vue') return []

	return [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => ({
		lineOffset: source.slice(0, match.index).split('\n').length,
		source: match[1],
	}))
}

const violations = []
const naiveInstanceClasses = new Set()

const lineAt = (source, index) => source.slice(0, index).split('\n').length

const inspectNaiveComponentUsage = (path, source) => {
	if (extname(path) !== '.vue') return

	for (const match of source.matchAll(/<n-([a-z0-9-]+)\b([\s\S]*?)(?:\/>|>)/gi)) {
		const component = match[1].toLowerCase()
		const attributes = match[2]
		const line = lineAt(source, match.index)

		if (sizeControlledComponents.has(component) && !/(?:^|\s):?size\s*=/.test(attributes)) {
			violations.push(`${path}:${line}: <n-${component}> must declare its native size prop.`)
		}

		const classMatch = attributes.match(/(?:^|\s)class\s*=\s*(["'])(.*?)\1/s)
		if (classMatch) {
			for (const className of classMatch[2].split(/\s+/).filter(Boolean)) {
				naiveInstanceClasses.add(className)
			}
		}

		for (const styleMatch of attributes.matchAll(/(?:^|\s)(:?)(style|header-style|body-style|content-style|footer-style|action-style)\s*=\s*(["'])([\s\S]*?)\3/g)) {
			const [, , propName, , value] = styleMatch
			const isDocumentedException = (component === 'drawer-content' && propName === 'body-content-style')
				|| (component === 'tooltip' && propName === 'content-style')
			if (!isDocumentedException && intrinsicInlineStylePattern.test(value)) {
				violations.push(`${path}:${line}: <n-${component}> uses intrinsic sizing through ${propName}; use size or an app-owned wrapper.`)
			}
		}
	}
}

const selectorTargetsClass = (selector, className) => selector
	.split(',')
	.some((part) => {
		const lastCompound = part.trim().split(/\s+|[>+~]/).filter(Boolean).at(-1) ?? ''
		return new RegExp(`\\.${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(lastCompound)
	})

const inspectNaiveInstanceStyles = (path, style) => {
	for (const match of style.source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selector = match[1].trim()
		const declarations = match[2]
		if (!intrinsicStylePattern.test(declarations)) continue

		for (const className of naiveInstanceClasses) {
			if (selectorTargetsClass(selector, className)) {
				violations.push(`${path}:${style.lineOffset + lineAt(style.source, match.index) - 1}: ${selector} changes intrinsic Naive UI sizing; use size or move layout to a wrapper.`)
			}
		}
	}
}

const files = sourceFiles(sourceRoot)

for (const path of files) {
	const source = readFileSync(path, 'utf8')
	inspectNaiveComponentUsage(path, source)
	if (sizedThemeTokenPattern.test(source)) {
		source.split('\n').forEach((line, index) => {
			if (sizedThemeTokenPattern.test(line) && !line.includes('naive-size-token-exception')) {
				violations.push(`${path}:${index + 1}: ${line.trim()} uses a size-specific theme token; use the component size prop.`)
			}
		})
	}
}

for (const path of files) {
	const source = readFileSync(path, 'utf8')
	for (const style of styleSources(path, source)) {
		style.source.split('\n').forEach((line, index) => {
			if (naiveStylePattern.test(line)) {
				violations.push(`${path}:${style.lineOffset + index + 1}: ${line.trim()}`)
			}
		})
		inspectNaiveInstanceStyles(path, style)
	}
}

if (violations.length) {
	console.error('Naive UI intrinsic sizing must use native size props. Direct selectors, internal variables and component-root size CSS are not allowed.')
	console.error(violations.join('\n'))
	process.exit(1)
}

console.log('Naive UI CSS boundary check passed.')
