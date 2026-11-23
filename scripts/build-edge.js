import { build } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distDir = resolve(root, 'dist');

// 1. Build entire frontend (including Three.js & themes) into single JS/CSS assets
await build({
  configFile: false,
  root,
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

// 2. Inline CSS and JS into a single self-contained HTML string
let html = readFileSync(resolve(distDir, 'index.html'), 'utf8');

html = html.replace(/<link[^>]+rel=["']modulepreload["'][^>]*>/gi, '');

html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi, (_, href) => {
  const assetPath = resolve(distDir, href.replace(/^\.?\//, ''));
  const css = readFileSync(assetPath, 'utf8');
  return `<style>${css}</style>`;
});

html = html.replace(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, (_, src) => {
  const assetPath = resolve(distDir, src.replace(/^\.?\//, ''));
  const js = readFileSync(assetPath, 'utf8').replace(/<\/script>/gi, '<\\/script>');
  return `<script type="module">${js}</script>`;
});

// 3. Bundle validation.js + s3.js + worker.js into dist/edge-worker.js
const stripModuleSyntax = (code) =>
  code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+[^;]+;\s*$/gm, '')
    .replace(/^\s*export\s+(?=(?:const|let|var|function|async\s+function|class)\b)/gm, '');

const validationCode = stripModuleSyntax(readFileSync(resolve(root, 'shared/validation.js'), 'utf8'));
const s3Code = stripModuleSyntax(readFileSync(resolve(root, 'edge/s3.js'), 'utf8'));
const workerCode = stripModuleSyntax(readFileSync(resolve(root, 'edge/worker.js'), 'utf8'));

const bundle = `(() => {
const __EDGE_CLASSIC__ = true;
const __KINGDOM_APP_HTML__ = ${JSON.stringify(html)};

${validationCode}

${s3Code}

${workerCode}
})();
`;

writeFileSync(resolve(distDir, 'edge-worker.js'), bundle, 'utf8');
console.log('Built dist/edge-worker.js successfully.');