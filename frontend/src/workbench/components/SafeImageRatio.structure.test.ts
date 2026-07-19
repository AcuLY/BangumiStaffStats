import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentsDirectory = new URL('.', import.meta.url)
const safeImageSource = readFileSync(new URL('./SafeImage.vue', import.meta.url), 'utf8')
const tokensSource = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
const workbenchStylesSource = readFileSync(new URL('../styles/workbench.css', import.meta.url), 'utf8')
const contentImageStylesUrl = new URL('../styles/modules/content-images.css', import.meta.url)
const contentImageStylesSource = existsSync(contentImageStylesUrl)
	? readFileSync(contentImageStylesUrl, 'utf8')
	: ''

const safeImageTags = readdirSync(componentsDirectory, { withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith('.vue'))
	.flatMap((entry) => {
		const source = readFileSync(new URL(entry.name, componentsDirectory), 'utf8')
		return [...source.matchAll(/<SafeImage\b[\s\S]*?\/>/g)].map((match) => ({
			file: entry.name,
			tag: match[0],
		}))
	})

describe('SafeImage content ratio', () => {
	it('defines one shared 3:4 design token and loads its invariant last', () => {
		expect(tokensSource).toContain('--content-image-aspect-ratio: 3 / 4;')
		expect(workbenchStylesSource.trimEnd()).toMatch(/@import '\.\/modules\/content-images\.css';$/)
	})

	it('owns intrinsic ratio inside SafeImage instead of accepting per-call heights', () => {
		expect(safeImageSource).toContain('const CONTENT_IMAGE_ASPECT_WIDTH = 3')
		expect(safeImageSource).toContain('const CONTENT_IMAGE_ASPECT_HEIGHT = 4')
		expect(safeImageSource).not.toMatch(/\bheight:\s*number/)
		expect(safeImageSource).not.toContain("'--safe-image-height'")
		expect(safeImageSource).toContain(':width="intrinsicWidth"')
		expect(safeImageSource).toContain(':height="intrinsicHeight"')

		expect(safeImageTags.length).toBeGreaterThan(0)
		for (const { file, tag } of safeImageTags) {
			expect(tag, `${file} must not override the shared image ratio`).not.toMatch(/\s:?height=/)
		}
	})

	it('keeps the shared ratio while allowing capped co-star card stretching', () => {
		expect(contentImageStylesSource).toContain('aspect-ratio: var(--content-image-aspect-ratio);')
		expect(contentImageStylesSource).toContain('height: auto;')
		expect(contentImageStylesSource).toContain('min-height: 0;')
		expect(contentImageStylesSource).toMatch(/\.safe-image\.person-profile__portrait\s*{[^}]*align-self:\s*start;/s)
		expect(contentImageStylesSource).toMatch(/\.profile-stage--people:not\(\.profile-stage--pair\):not\(\.single-cooperation__profile-stage\)\s*>\s*\.analysis-profile\s*{[^}]*max-width:\s*none;[^}]*max-height:\s*261\.333px;/s)
		expect(contentImageStylesSource).toMatch(/@container\s+relationship-hero\s*\(max-width:\s*519px\)[^{]*{[\s\S]*max-height:\s*240px;/)
		expect(contentImageStylesSource).toMatch(/\.candidate-row__portrait[^}]*aspect-ratio:\s*var\(--content-image-aspect-ratio\);/s)
		expect(contentImageStylesSource).toMatch(/\.subject-work-row__cover-media[^}]*aspect-ratio:\s*var\(--content-image-aspect-ratio\);/s)
	})
})
