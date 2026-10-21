import { createHash } from 'node:crypto';
import { intentPrompt } from '../packages/infrastructure/src/intent-prompt.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { equivalentIntent } from '@sdj/testing';
import { loadEnvironment } from '@sdj/config';
import { HTTPAIAdapter, ProviderFailure, targetsFromEnvironment } from '@sdj/infrastructure';
import * as baseline from '../tests/evaluation/intent-v1.js';
import * as conversation from '../tests/evaluation/conversation-v2.js';
import { parseCommand, type CommandProposal, type InterpretationContext } from '@sdj/domain';

async function main(): Promise<void> {
  loadEnvironment();
  const {
    cases,
    datasetVersion,
  }: {
    cases: readonly {
      id: string;
      text: string;
      expected: CommandProposal;
      context?: InterpretationContext;
    }[];
    datasetVersion: string;
  } = process.argv.includes('--conversation') ? conversation : baseline;
  const live = process.argv.includes('--live');
  const provider = process.argv.find((a) => a.startsWith('--provider='))?.split('=')[1];
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('INVALID_LIMIT');
  if (!live) {
    process.stdout.write(
      `${datasetVersion}: ${cases.length} kasus sintetis tersedia. Gunakan --live --provider=groq|gemini|nvidia untuk memanggil API gratis dengan batas lokal.\n`
    );
    return;
  }
  const targets = targetsFromEnvironment(true).filter((t) => t.enabled && t.id === provider);
  if (targets.length !== 1) throw new Error('SELECT_ONE_CONFIGURED_PROVIDER');
  const target = targets[0]!,
    adapter = new HTTPAIAdapter();
  await mkdir('.local/evaluation', { recursive: true });
  const promptHash = createHash('sha256').update(intentPrompt()).digest('hex').slice(0, 12);
  const path = `.local/evaluation/${datasetVersion}-${target.id}-${promptHash}${process.argv.includes('--model-only') ? '-model' : '-pipeline'}.json`;
  type Result = {
    id: string;
    ok: boolean;
    ms: number;
    error?: string;
    date: string;
    actual?: CommandProposal;
    route?: 'parser' | 'model';
  };
  let results: Result[] = [];
  let attemptDates: string[] = [];
  try {
    const prior = JSON.parse(await readFile(path, 'utf8')) as {
      model: string;
      results: Result[];
      attemptDates?: string[];
    };
    if (prior.model === target.model) {
      results = prior.results;
      attemptDates = prior.attemptDates ?? prior.results.map((r) => r.date);
    }
  } catch {
    /* New run. */
  }
  const today = new Date().toISOString().slice(0, 10),
    completed = new Set(
      results.filter((r) => !process.argv.includes('--retry-failed') || r.ok).map((r) => r.id)
    );
  let usedToday = attemptDates.filter((date) => date.startsWith(today)).length;
  for (const item of cases.slice(0, limit)) {
    if (completed.has(item.id)) continue;
    const direct = process.argv.includes('--model-only') ? null : parseCommand(item.text);
    if (!direct && usedToday >= target.requestsPerDay) {
      process.stdout.write(
        'Batas request harian lokal tercapai. Jalankan lagi pada hari berikutnya.\n'
      );
      break;
    }
    const recent = attemptDates.at(-1);
    if (!direct && recent) {
      const remaining = 60000 / target.requestsPerMinute - (Date.now() - Date.parse(recent));
      if (remaining > 0) await delay(Math.min(60000, remaining));
    }
    const start = performance.now();
    let ok = false,
      error: string | undefined,
      actual: CommandProposal | undefined;
    try {
      actual =
        direct ??
        (await adapter.interpret(target, item.text, AbortSignal.timeout(6000), item.context));
      ok = equivalentIntent(actual, item.expected, item.context);
      if (!ok) error = 'intent_mismatch';
    } catch (e) {
      error = e instanceof ProviderFailure ? e.category : 'invalid_output';
    }
    const result: Result = {
      id: item.id,
      ok,
      ms: Math.round(performance.now() - start),
      date: new Date().toISOString(),
      ...(error ? { error } : {}),
      ...(actual ? { actual } : {}),
      route: direct ? 'parser' : 'model',
    };
    results = results.filter((r) => r.id !== result.id);
    results.push(result);
    if (!direct) {
      attemptDates.push(result.date);
      usedToday++;
    }
    await writeFile(
      path,
      JSON.stringify(
        {
          dataset: datasetVersion,
          promptHash,
          provider: target.provider,
          model: target.model,
          attemptDates,
          results,
        },
        null,
        2
      )
    );
    process.stdout.write(
      `${target.provider} ${item.id}: ${ok ? 'pass' : error} (${result.ms}ms)\n`
    );
    if (['authentication', 'configuration', 'rate_limit'].includes(error ?? '')) break;
  }
  const pass = results.filter((r) => r.ok).length;
  process.stdout.write(
    `${target.provider}: ${pass}/${results.length} lulus; ${cases.length} kasus diperlukan untuk gate lengkap. Report: ${path}\n`
  );
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}
main().catch(() => {
  process.stderr.write('AI_EVALUATION_FAILED: periksa provider/.env, tanpa mencetak credential.\n');
  process.exitCode = 1;
});
