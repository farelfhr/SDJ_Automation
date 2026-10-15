# SDJ Assistant: paket perancangan

Versi 1.0.0, 15 Oktober 2026.

SDJ Assistant adalah rencana produk pencatatan tracker spiritual pribadi melalui WhatsApp. Banyak peserta menggunakan satu bot, tetapi masing-masing menghubungkan Google Sheet dan izin aksesnya sendiri. Parser menangani format sederhana, sementara router Gemini/Groq membantu bahasa bebas ketika tersedia.

## Status yang sebenarnya

Repository awal ini berisi dokumen. Belum ada aplikasi, package.json, migration yang dijalankan, koneksi Google, gateway OpenClaw teruji, atau hasil evaluasi AI. Perintah pengembangan dalam AGENTS.md adalah target bootstrap, bukan command yang sudah dapat dijalankan.

## Peta dokumen

| File | Pertanyaan yang dijawab |
| --- | --- |
| [PRD.md](PRD.md) | Masalah apa yang diselesaikan, siapa penggunanya, apa lingkup dan kriteria selesai? |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Bagaimana sistem dibagi, bagaimana data mengalir, dan siapa berwenang menulis? |
| [SCHEMA.md](SCHEMA.md) | Apa tabel, kontrak, tipe nilai, status, relasi, dan constraint yang diperlukan? |
| [AGENTS.md](AGENTS.md) | Bagaimana Claude Code/Codex harus mengerjakan dan memverifikasi codebase? |
| [CLAUDE.md](CLAUDE.md) | Memuat instruksi bersama untuk kompatibilitas Claude Code melalui import AGENTS.md |

Empat file utama merupakan spesifikasi yang diminta. README dan CLAUDE adalah pelengkap untuk memudahkan pemakaian paket pada coding agent.

## Keputusan yang sudah ditetapkan

- Backend TypeScript modular monolith dengan PostgreSQL. API dan worker berasal dari satu codebase.
- OpenClaw diposisikan sebagai adapter kanal, bukan tenant isolation atau pemilik token Google.
- Routing/retry AI berada di backend, sehingga perintah sederhana tidak membayar satu panggilan model hanya untuk diteruskan.
- Google OAuth per peserta dan pemilihan file dengan Picker, diikuti verifikasi DM asal.
- MVP lima salat, operasi set skor 0–3, rekap, koreksi, dan undo bersyarat.
- Journal sebelum write, readback, dan rekonsiliasi untuk timeout. Tidak menjanjikan transaksi atomik DB + Sheets.
- Aktivitas tambahan, increment, pengingat, dan multi-item ditempatkan sesudah core stabil.

## Cara mulai dengan Claude Code atau Codex

Ekstrak seluruh paket ke direktori repository baru. Pertahankan keenam dokumen pada root. Jangan menyalin file tracker pribadi ke repository. Coding agent kemudian dapat diberi instruksi berikut:

```text
Baca AGENTS.md, PRD.md, ARCHITECTURE.md, dan SCHEMA.md secara lengkap.
Bangun SDJ Assistant mengikuti milestone G0 dan M1.

Mulai dengan memeriksa lingkungan dan membuat rencana implementasi singkat.
Untuk G0, verifikasi API/versi OpenClaw dari sumber resmi dan catat bukti atau
blocker. Jangan membuat hook atau endpoint OpenClaw yang tidak terbukti ada.
Jika akses OpenClaw belum tersedia, lanjutkan M1 memakai fake channel.

Bootstrap TypeScript strict, PostgreSQL, parser, tenant-scoped repositories,
durable jobs, mutation journal, dan delivery outbox. Gunakan fake Sheets dan
fake AI untuk pengujian lokal. Selesaikan satu vertical slice dua peserta
dengan tracker sintetis berbeda, pencatatan, rekap, koreksi, dan undo.

Uji deduplikasi, isolasi tenant, timeout write, dan crash recovery.
Jangan memakai credential atau tracker asli, mengirim WhatsApp sungguhan,
membuat akun eksternal, atau mengaktifkan biaya.
Catat hasil dan langkah berikutnya pada docs/IMPLEMENTATION_STATUS.md.
Jangan menyatakan integrasi live selesai jika baru fake tests yang lulus.
```

## Gate yang harus dibuka sebelum pilot

1. OpenClaw dapat meneruskan identitas asli dan pesan tanpa model default/auto-reply ganda.
2. Tracker peserta sudah native Google Sheets, izin editor sah, dan lima baris aktivitas cocok.
3. OAuth/Picker dan konfirmasi DM benar-benar diuji pada akun test.
4. Dua peserta tidak bisa mengakses data satu sama lain, termasuk lewat prompt berbahaya.
5. Model yang dipilih lulus evaluasi kontrak, dan semua-provider-gagal tetap menyisakan parser.
6. Timeout, restart, outbox, retensi, dan pemulihan backup memiliki bukti pengujian.

## Hal yang perlu keputusan pemilik produk kemudian

Nama final, lingkungan hosting, budget, kebijakan retensi final, daftar model/provider aktif, dan satuan aktivitas tambahan. Default sementara dan risiko setiap keputusan sudah dicatat pada PRD. Tidak ada keputusan tersebut yang menghalangi pengerjaan core lokal berbasis data sintetis.

Sumber teknis resmi dan tanggal pemeriksaan ada pada [ARCHITECTURE.md bagian 16](ARCHITECTURE.md#16-sumber-teknis-resmi).
