import { defineWorkspace } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const alias = Object.fromEntries(['domain','contracts','config','application','infrastructure','testing'].map(name => [`@sdj/${name}`, fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))]));
export default defineWorkspace(['unit','integration','e2e'].map(name => ({
 resolve: { alias },
 test: { name, include: [`tests/${name}/**/*.test.ts`], environment:'node', testTimeout:30000, hookTimeout:30000,
 pool:'forks', poolOptions:{forks:{singleFork:true}} }
})));
