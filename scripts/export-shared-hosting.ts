import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homePage, privacyPage, termsPage } from '../apps/api/src/public-pages.js';

// Export only explicit public pages. Never traverse the workspace or load .env.
const parent = resolve('.local/deployment');
await mkdir(parent, { recursive: true });
const build = await mkdtemp(join(parent, 'shared-hosting-'));
const root = join(build, 'public_html');
await mkdir(root);
for (const [path, html] of [
  ['index.html', homePage()],
  ['privacy/index.html', privacyPage()],
  ['terms/index.html', termsPage()],
] as const) {
  const target = join(root, path);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, html, 'utf8');
}
await writeFile(
  join(root, '.htaccess'),
  `# Public static pages only. HTTPS is enabled using the hosting panel AutoSSL.
DirectoryIndex index.html
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin"
  Header always set Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
</IfModule>
`,
  'utf8'
);
// Machine-readable result lets packaging use the fresh directory only.
process.stdout.write(
  JSON.stringify({
    root,
    files: ['index.html', 'privacy/index.html', 'terms/index.html', '.htaccess'],
  }) + '\n'
);
