import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({})

export default [
	...baseConfig,
	{
		// The whole package is ES modules.
		files: ['**/*.js'],
		languageOptions: {
			sourceType: 'module',
		},
	},
]
