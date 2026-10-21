import { loadConfig } from '@sdj/config';
import { createRuntime, targetsFromEnvironment } from '@sdj/infrastructure';
async function main(): Promise<void> {
  const c = loadConfig(),
    runtime = createRuntime();
  try {
    if (!(await runtime.store.health())) throw new Error('DATABASE_NOT_READY');
    process.stdout.write('Database utama: ready, role runtime dibatasi RLS.\n');
    const google = Boolean(
      c.googleClientId && c.googleClientSecret && c.googlePickerKey && c.googleAppId
    );
    process.stdout.write(
      `Google OAuth/Picker: ${google ? 'configured; login peserta masih diperlukan' : 'belum lengkap; lihat docs/runbooks/google-oauth.md'}\n`
    );
    for (const target of targetsFromEnvironment(c.liveAI))
      process.stdout.write(
        `AI ${target.provider}: ${target.enabled ? 'credential/model tersedia' : 'belum lengkap/nonaktif'}; registry dan evaluasi diperiksa terpisah\n`
      );
    process.stdout.write(
      'WhatsApp: DM peserta terbuka tanpa pairing code; sesi ponsel bot dan gate G0 diperiksa terpisah.\n'
    );
  } finally {
    await runtime.store.close();
  }
}
main().catch(() => {
  process.stderr.write('SETUP_CHECK_FAILED: periksa .env utama dan akses database.\n');
  process.exitCode = 1;
});
