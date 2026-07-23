import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentsDirectory = new URL('.', import.meta.url)
const safeImageSource = readFileSync(new URL('./SafeImage.vue', import.meta.url), 'utf8')
const selectedPersonCardSource = readFileSync(new URL('./SelectedPersonCard.vue', import.meta.url), 'utf8')
const tokensSource = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
const workbenchStylesSource = readFileSync(new URL('../styles/workbench.css', import.meta.url), 'utf8')
const selectedPeopleStylesSource = readFileSync(new URL('../styles/modules/selected-people.css', import.meta.url), 'utf8')
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

	it('uses a text-free decorative fallback until a final placeholder image is selected', () => {
		expect(safeImageSource).not.toContain('fallbackLabel')
		expect(safeImageSource).not.toContain('图片无法加载')
		expect(safeImageSource).not.toContain(':aria-label="decorative ? undefined : fallbackLabel"')
		expect(safeImageSource).toMatch(/v-else[\s\S]*?class="safe-image__fallback"[\s\S]*?aria-hidden="true"/)
	})

	it('keeps selected-person and candidate portraits on the shared 3:4 geometry', () => {
		expect(contentImageStylesSource).toMatch(/\.safe-image:is\(\.safe-image--person, \.safe-image--character, \.safe-image--subject\)\s*\{[^}]*aspect-ratio:\s*var\(--content-image-aspect-ratio\);[^}]*height:\s*auto;[^}]*min-height:\s*0;/s)
		expect(selectedPersonCardSource).toMatch(/<SafeImage[\s\S]*?class="selected-person-card__image"[\s\S]*?:width="84"[\s\S]*?\/>/)

		const selectedPersonImageRule = selectedPeopleStylesSource.match(
			/\.selected-person-card__image\s*\{([^}]*)\}/s,
		)?.[1] ?? ''
		expect(selectedPersonImageRule).toContain('width: 84px;')
		expect(selectedPersonImageRule).toContain('height: auto;')
		expect(selectedPersonImageRule).toContain('min-height: 0;')
		expect(selectedPersonImageRule).not.toMatch(/height:\s*\d+px;/)

		expect(contentImageStylesSource).toMatch(/\.candidate-row__portrait[^}]*aspect-ratio:\s*var\(--content-image-aspect-ratio\);[^}]*height:\s*auto;/s)
		expect(contentImageStylesSource).toMatch(/\.subject-work-row__cover-media[^}]*aspect-ratio:\s*var\(--content-image-aspect-ratio\);[^}]*height:\s*auto;/s)
		expect(tokensSource).not.toContain('--co-star-card-aspect-ratio:')
	})
})
