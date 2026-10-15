/**
 * Process Message Use Case
 *
 * Main use case for processing inbound WhatsApp messages.
 */

import { ok, err, type Result } from '@sdj/domain';
import type {
  IntentInterpreter,
  ChannelGateway,
  MutationRepository,
  TrackerConnectionRepository,
  InboundMessageRepository,
  TrackerGateway,
} from '../ports/index.js';
import type { InboundMessage } from '@sdj/contracts';
import type { CommandProposal, Mutation, User } from '@sdj/domain';

export interface ProcessMessageInput {
  message: InboundMessage;
  userId: string;
  user: User;
}

export interface ProcessMessageOutput {
  readonly response: string;
  readonly action: string;
  readonly success: boolean;
}

/**
 * Process a message and generate response
 */
export class ProcessMessageUseCase {
  constructor(
    private readonly intentInterpreter: IntentInterpreter,
    private readonly channelGateway: ChannelGateway,
    private readonly mutationRepository: MutationRepository,
    private readonly trackerConnectionRepository: TrackerConnectionRepository,
    private readonly inboundMessageRepository: InboundMessageRepository,
    private readonly trackerGateway: TrackerGateway
  ) {}

  async execute(input: ProcessMessageInput): Promise<Result<ProcessMessageOutput>> {
    const { message, userId, user } = input;

    // 1. Check if user has consent
    if (!user.consentGiven) {
      return ok({
        response: this.formatConsentRequired(),
        action: 'CONSENT_REQUIRED',
        success: false,
      });
    }

    // 2. Check if user has tracker connected
    const trackerConnection = await this.trackerConnectionRepository.getActiveByUserId(userId);
    if (!trackerConnection) {
      return ok({
        response: this.formatTrackerNotLinked(),
        action: 'TRACKER_NOT_LINKED',
        success: false,
      });
    }

    // 3. Check for duplicate message
    if (await this.inboundMessageRepository.exists(message.id)) {
      return ok({
        response: '',
        action: 'DUPLICATE_IGNORED',
        success: true,
      });
    }

    // 4. Save inbound message
    await this.inboundMessageRepository.create(message);

    // 5. Parse the message
    const parseResult = this.intentInterpreter.parse(message.content);

    // 6. If needs AI and enabled, try AI interpretation
    let proposal = parseResult.proposal;
    if (parseResult.proposal.requiresAI && parseResult.confidence < 1.0) {
      try {
        const aiResult = await this.intentInterpreter.interpretWithAI(message.content, userId);
        proposal = aiResult.proposal;
      } catch {
        // AI failed, use parsed result with low confidence
      }
    }

    // 7. Execute the command
    const response = await this.executeCommand(proposal, userId, trackerConnection.spreadsheetId, trackerConnection.sheetName);

    // 8. Send response
    if (response) {
      const outbound = this.channelGateway.formatResponse(user, response);
      await this.channelGateway.send(outbound);
    }

    return ok({
      response: response || 'Pesan diterima',
      action: proposal.action,
      success: true,
    });
  }

  private async executeCommand(
    proposal: CommandProposal,
    userId: string,
    spreadsheetId: string,
    sheetName: string
  ): Promise<string> {
    switch (proposal.action) {
      case 'SET_SCORE':
        return this.executeSetScore(proposal, userId, spreadsheetId, sheetName);
      case 'QUERY':
        return this.executeQuery(proposal, spreadsheetId, sheetName);
      case 'RECAP':
        return this.executeRecap(proposal, spreadsheetId, sheetName);
      case 'UNDO':
        return this.executeUndo(userId, spreadsheetId, sheetName);
      case 'HELP':
        return this.formatHelp();
      case 'STATUS':
        return 'Status: Terhubung ✅';
      default:
        return this.formatUnknownCommand();
    }
  }

  private async executeSetScore(
    proposal: CommandProposal,
    userId: string,
    spreadsheetId: string,
    sheetName: string
  ): Promise<string> {
    if (!proposal.activityId || proposal.score === undefined || !proposal.date) {
      return 'Perintah tidak lengkap';
    }

    // Check idempotency
    const idempotencyKey = `${userId}:${proposal.activityId.id}:${proposal.date.date.toISOString()}`;
    if (await this.mutationRepository.existsByIdempotencyKey(idempotencyKey)) {
      return `${proposal.activityId.displayName} untuk ${proposal.date.description} sudah dicatat`;
    }

    // Read current value
    const currentScore = await this.trackerGateway.readCell(
      spreadsheetId,
      sheetName,
      proposal.date.date.getDate() + 2, // Row offset
      2 // Column B
    );

    // Create mutation
    const mutation = await this.mutationRepository.create({
      id: crypto.randomUUID(),
      userId,
      type: 'SET_SCORE',
      action: proposal.action,
      activityId: proposal.activityId,
      targetDate: proposal.date,
      newValue: proposal.score,
      previousValue: currentScore ?? undefined,
      status: 'PENDING',
      createdAt: new Date(),
      idempotencyKey,
      channelMessageId: '',
    });

    // Write to tracker
    try {
      await this.trackerGateway.writeScore(
        spreadsheetId,
        sheetName,
        { activityId: proposal.activityId, rowOffset: 0, columnOffset: 0 },
        proposal.date,
        proposal.score
      );

      // Mark as applied
      await this.mutationRepository.updateStatus(mutation.id, 'APPLIED', new Date());

      return `✅ ${proposal.activityId.displayName} untuk ${proposal.date.description} dicatat: ${proposal.score}`;
    } catch (error) {
      await this.mutationRepository.updateStatus(mutation.id, 'FAILED');
      return 'Gagal menyimpan. Silakan coba lagi.';
    }
  }

  private async executeQuery(
    proposal: CommandProposal,
    spreadsheetId: string,
    sheetName: string
  ): Promise<string> {
    if (!proposal.activityId || !proposal.date) {
      return 'Perintah tidak lengkap';
    }

    const score = await this.trackerGateway.readCell(
      spreadsheetId,
      sheetName,
      proposal.date.date.getDate() + 2,
      2
    );

    if (score === null) {
      return `${proposal.activityId.displayName} untuk ${proposal.date.description}: belum dicatat`;
    }

    const scoreLabels: Record<number, string> = {
      0: 'tidak dilaksanakan',
      1: 'berjamaah',
      2: 'sendiri',
      3: 'tepat waktu + berjamaah',
    };

    return `${proposal.activityId.displayName} untuk ${proposal.date.description}: ${score} (${scoreLabels[score] ?? ''})`;
  }

  private async executeRecap(
    proposal: CommandProposal,
    spreadsheetId: string,
    sheetName: string
  ): Promise<string> {
    if (!proposal.date) {
      return 'Perintah tidak lengkap';
    }

    const date = proposal.date.date;
    const lines: string[] = [`📊 Ringkasan ${proposal.date.description}:\n`];

    const prayers = ['subuh', 'zuhur', 'ashar', 'maghrib', 'isya'];
    let total = 0;

    for (let i = 0; i < prayers.length; i++) {
      const score = await this.trackerGateway.readCell(
        spreadsheetId,
        sheetName,
        date.getDate() + 2,
        i + 2
      );

      if (score !== null) {
        total += score;
        lines.push(`• ${prayers[i]}: ${score}`);
      } else {
        lines.push(`• ${prayers[i]}: -`);
      }
    }

    lines.push(`\nTotal: ${total}/15`);

    return lines.join('\n');
  }

  private async executeUndo(
    userId: string,
    spreadsheetId: string,
    sheetName: string
  ): Promise<string> {
    const lastMutation = await this.mutationRepository.getLastUndoable(userId);

    if (!lastMutation) {
      return 'Tidak ada perubahan yang bisa dibatalkan';
    }

    // Write previous value back
    if (lastMutation.previousValue !== undefined) {
      await this.trackerGateway.writeScore(
        spreadsheetId,
        sheetName,
        { activityId: lastMutation.activityId, rowOffset: 0, columnOffset: 0 },
        lastMutation.targetDate,
        lastMutation.previousValue
      );
    }

    await this.mutationRepository.updateStatus(lastMutation.id, 'ROLLED_BACK');

    return `✅ Pembatalan berhasil untuk ${lastMutation.activityId.displayName}`;
  }

  private formatHelp(): string {
    return `
📖 Petunjuk Penggunaan SDJ Assistant

**Mencatat Sholat:**
• subuh 3 - Sholat Subuh hari ini
• zuhur 2 kemarin - Sholat Zuhur kemarin
• isya 1, 2026-10-15 - Sholat Isya tanggal tersebut

**Skor:**
• 0 = tidak dilaksanakan
• 1 = berjamaah
• 2 = sendiri
• 3 = tepat waktu + berjamaah

**Perintah Lain:**
• rekap hari ini - Ringkasan harian
• batal - Batalkan perubahan terakhir
• bantuan - Tampilkan bantuan
• status - Cek status koneksi
`;
  }

  private formatConsentRequired(): string {
    return 'Silakan setujui penggunaan aplikasi ini terlebih dahulu.';
  }

  private formatTrackerNotLinked(): string {
    return 'Tracker belum terhubung. Silakan hubungkan Google Sheet Anda.';
  }

  private formatUnknownCommand(): string {
    return 'Perintah tidak dikenali. Ketik "bantuan" untuk melihat panduan.';
  }
}
