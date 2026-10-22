#!/usr/bin/env node
// Bundles the split project back into ONE playable HTML file: dist/infinite-realms.html
// Usage:  node build.js        (no dependencies, Node 14+)
// Each <script src> becomes its own inline <script>, in the same order, so behaviour is identical.
const fs = require('fs'), path = require('path');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, f) => `<style>\n${read(f)}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => {
  const code = read(f);
  if (/<\/script/i.test(code)) throw new Error(f + ' contains "</script" which would break inlining');
  return `<script>\n${code}</script>`;
});
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'infinite-realms.html');
fs.writeFileSync(out, html);
console.log('Built', out, '(' + Math.round(html.length / 1024) + ' KB)');
