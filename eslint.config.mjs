import coreWebVitals from 'eslint-config-next/core-web-vitals';

// `next/core-web-vitals` already pulls in the base `next` and `next/typescript`
// configs, so extending it alone covers rules, parser and TS support.
export default [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      // Service worker and icons are emitted by scripts/generate-pwa-icons.mjs
      'public/sw.js',
      'public/icons/**',
    ],
  },
  ...coreWebVitals,
];
