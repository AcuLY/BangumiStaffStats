import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import svgLoader from 'vite-svg-loader'
import AutoImport from 'unplugin-auto-import/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		vue(),
		svgLoader(),
		AutoImport({
			imports: [
				'vue',
				{
					'naive-ui': ['useNotification'],
				},
			],
			dts: 'src/auto-imports.d.ts'
		}),
		Components({
			dirs: ['src/components', 'src/pages'],
			deep: true,
			dts: 'src/components.d.ts',
			resolvers: [NaiveUiResolver()],
		}),
	],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	test: {
		globals: true,
	},
})
