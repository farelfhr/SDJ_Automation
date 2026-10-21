# Spike OpenClaw 2026.10.3

Pemeriksaan: 15 Oktober 2026, Asia/Jakarta. Host OpenClaw 2026.10.3 (59cb447), plugin WhatsApp 2026.10.3, Node 24.16.0. API diperiksa dari SDK/source yang terpasang dan [message hooks](https://docs.openclaw.ai/plugins/hooks/messages), [WhatsApp](https://docs.openclaw.ai/channels/whatsapp), serta [pairing CLI](https://docs.openclaw.ai/cli/pairing).

## Bukti

- Tambahan Linux 18 Oktober: loader menolak path plugin world-writable dan plugin eksternal memerlukan hooks.allowConversationAccess=true. Inspeksi runtime dengan `plugins inspect sdj-bridge --runtime --json` diperlukan untuk membuktikan typed hook before_dispatch serta service sdj-outbox. `plugins list` dapat menampilkan status metadata loaded dengan hookCount 0 dan bukan bukti registrasi runtime. Launcher kini berhenti bila inspeksi runtime gagal.

- `config validate` menerima konfigurasi utama; loader menemukan bridge SDJ dan WhatsApp.
- API native `loginWeb` dari `@openclaw/whatsapp/dist/runtime-api.js` menampilkan QR terminal. Sesi utama berhasil dipasangkan dan disimpan.
- `channels status` melaporkan configured/linked/running/connected tanpa lastError.
- SDK/source mengonfirmasi `before_dispatch` dengan `{handled:true}` untuk menghentikan model/balasan default, serta `runtime.channel.outbound.loadAdapter('whatsapp').sendText` untuk balasan.
- Pesan `daftar` nyata masuk melalui signed ingress, worker menyelesaikan command tanpa AI, dan onboarding/outbox dibuat.
- Uji awal menemukan context `conversationId` dapat berisi recipient bot. Balasan diakui platform tetapi tidak sampai ke peserta. Bridge diperbaiki agar DM WhatsApp memakai `senderId` kanal yang terverifikasi sebagai tujuan balasan. Body pesan tidak menentukan actor/tujuan. Regression test mencakup dua pengirim.
- `selfChatMode:false`, grup disabled, DM pairing, `session.dmScope:per-account-channel-peer`, dan tools deny-all dikonfigurasi. Source plugin mengonfirmasi filter fromMe, stale append, dan echo.

## Gate tersisa

Balasan nyata setelah perbaikan route telah dikonfirmasi pengguna (tautan onboarding diterima). Onboarding Google nyata, dua peserta, reconnect/history, penolakan grup/echo, dan kebijakan penyimpanan transkrip masih diperlukan sebelum G0/pilot dinyatakan lulus. Retensi backend tidak otomatis mencakup SQLite/transkrip OpenClaw. Google token tetap terenkripsi pada backend, bukan di gateway.

CLI `channels login` sempat gagal generik; `pnpm whatsapp:pair` memakai API login native dari paket yang sama. CLI sempat memberi cleanup timeout setelah approval pairing, tetapi approval diakui dan koneksi diverifikasi. Periksa state sebelum mengulang approval.
