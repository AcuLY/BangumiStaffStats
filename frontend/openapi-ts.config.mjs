import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../contracts/openapi/openapi.yaml',
  output: {
    path: 'src/api/generated/query-wire',
    clean: true,
    entryFile: false,
    fileName: {
      suffix: '.gen',
    },
    source: false,
  },
  plugins: [
    {
      name: '@hey-api/typescript',
      enums: false,
      topType: 'unknown',
    },
  ],
});
