module.exports = {
	env: {
		browser: true,
		es6: true,
		node: true,
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: ['./tsconfig.json'],
		sourceType: 'module',
		extraFileExtensions: ['.json'],
	},
	plugins: ['n8n-nodes-base'],
	extends: [
		'plugin:n8n-nodes-base/community',
		'plugin:n8n-nodes-base/credentials',
		'plugin:n8n-nodes-base/nodes'
	],
	ignorePatterns: ['**/node_modules/**', '**/dist/**'],
	overrides: [
		{
			files: ['package.json'],
			rules: {
				'n8n-nodes-base/community-package-json-name-still-default': 'error',
			},
		},
		{
			files: ['./credentials/**/*.ts', './nodes/**/*.ts'],
			rules: {
				'n8n-nodes-base/cred-class-field-documentation-url-missing': 'off',
				'n8n-nodes-base/node-execute-block-missing-continue-on-fail': 'off',
			},
		},
	],
};
