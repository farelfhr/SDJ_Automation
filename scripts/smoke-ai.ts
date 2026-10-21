import { loadEnvironment } from '@sdj/config';
import { HTTPAIAdapter, ProviderFailure, targetsFromEnvironment } from '@sdj/infrastructure';

// Explicit opt-in. Synthetic input only: never loads a participant, calls Sheets or sends a DM.
loadEnvironment();
const provider = process.argv.find((arg) => arg.startsWith('--provider='))?.slice(11);
const target = targetsFromEnvironment(true).find((candidate) => candidate.id === provider);
if (!process.argv.includes('--live') || !target?.enabled) {
  console.error('Use --live --provider=<configured provider>. No model request was made.');
  process.exitCode = 1;
} else {
  const started = performance.now();
  let status: number | undefined;
  let servedModel: string | undefined;
  let cost: number | undefined;
  const adapter = new HTTPAIAdapter(async (input, init) => {
    const response = await fetch(input, init);
    status = response.status;
    if (response.ok) {
      const payload: unknown = await response.clone().json();
      if (payload && typeof payload === 'object') {
        if ('model' in payload && typeof payload.model === 'string') servedModel = payload.model;
        if (
          'usage' in payload &&
          payload.usage &&
          typeof payload.usage === 'object' &&
          'cost' in payload.usage &&
          typeof payload.usage.cost === 'number'
        )
          cost = payload.usage.cost;
      }
    }
    return response;
  });
  try {
    const proposal = await adapter.interpret(
      target,
      'Tolong catat skor subuh tiga untuk hari ini',
      AbortSignal.timeout(target.timeoutMs ?? 8000),
      { localDate: '2026-10-19' }
    );
    const passed =
      proposal.action === 'set_activities' &&
      proposal.items.length === 1 &&
      proposal.items[0]?.activity_id === 'subuh' &&
      proposal.items[0]?.value === 3 &&
      proposal.items[0]?.date_reference.kind === 'today';
    console.log(
      JSON.stringify({
        provider,
        passed,
        status,
        servedModel,
        cost,
        ms: Math.round(performance.now() - started),
        sheetsWrites: 0,
        messagesSent: 0,
      })
    );
    if (!passed || (target.provider === 'openrouter' && cost !== undefined && cost !== 0))
      process.exitCode = 1;
  } catch (error) {
    console.log(
      JSON.stringify({
        provider,
        passed: false,
        status,
        category: error instanceof ProviderFailure ? error.category : 'invalid_result',
        ms: Math.round(performance.now() - started),
        sheetsWrites: 0,
        messagesSent: 0,
      })
    );
    process.exitCode = 1;
  }
}
