// Versioned staging patch for the exact approved upstream source archive.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(pkg.version, '0.5.104');
const file = 'next.config.mjs';
const source = readFileSync(file, 'utf8');
const anchor = '  experimental: {';
assert.equal(source.split(anchor).length, 2, 'UPSTREAM_ANCHOR_CHANGED');
assert(!source.includes('SDJ bounded build'), 'PATCH_ALREADY_APPLIED');
writeFileSync(file, source.replace(anchor, `${anchor}
    // SDJ bounded build, patch 0001: one worker, lower Webpack memory.
    cpus: 1,
    workerThreads: false,
    webpackBuildWorker: false,
    webpackMemoryOptimizations: true,
    serverSourceMaps: false,`));
console.log('NINEROUTER_BOUNDED_BUILD_PATCH_APPLIED');
