# Operasional SDJ Assistant

## Runtime utama

Gunakan folder `D:\Dev\SDJ_Automation` dan `.env` utama. `pnpm dev` menjalankan API, satu worker, dan pemeliharaan pada startup lalu setiap jam. API bind ke `127.0.0.1:3000`; `GET /health/ready` memeriksa database dengan role runtime. Google OAuth/WhatsApp/model memiliki pemeriksaan terpisah.

Sesudah perubahan `.env`, hentikan launcher dengan Ctrl+C lalu jalankan lagi. Jangan menjalankan worker kedua secara tidak sengaja. Hentikan worker/gateway sebelum integration tests pada database utama supaya job sintetis tidak diproses runtime nyata.

Untuk halaman penghubungan dari HP/laptop lain, jalankan `pnpm share` setelah API siap. Lihat [akses publik ngrok dan penyesuaian Google OAuth](public-access.md). Tunnel menuju proxy onboarding pada loopback port 3001; ingress/outbox tetap memakai API loopback port 3000, bukan domain publik.

## WhatsApp

Runtime yang dipin: Node 24.16.0, OpenClaw dan `@openclaw/whatsapp` 2026.10.3. Sesi utama berada di `.local/openclaw-state`. Jangan menghapus atau membagikan folder tersebut.

Pairing awal atau penggantian sesi, saat gateway berhenti:

```powershell
pnpm whatsapp:pair
```

Perintah ini memakai API `loginWeb` resmi dari paket WhatsApp yang dipin. QR ditampilkan langsung di terminal dan diperbarui otomatis. Perlebar terminal agar seluruh QR terlihat. Setelah scan berhasil, `.local/whatsapp-pair-status.json` berisi status koneksi tanpa nomor telepon/token.

Setelah pairing:

```powershell
pnpm openclaw gateway run
pnpm openclaw channels status --channel whatsapp --json --timeout 10000
```

Perintah status dapat memuat identitas akun; jangan menyalin output lengkap ke log bersama. Startup pertama di Windows dapat memerlukan waktu untuk memuat modul. Peserta mengirim DM dari akun lain; self-chat dan grup dinonaktifkan.

DM peserta terbuka untuk semua nomor: `dmPolicy: open` dan `allowFrom: ["*"]` pada kanal serta akun utama. Nomor baru langsung mengirim `daftar`, login Google, memilih tracker, lalu mengonfirmasi tracker dari DM asal. Tidak ada pairing code peserta atau approval operator. QR di atas hanya untuk menghubungkan ponsel akun bot ke gateway saat sesi belum tersedia.

Launcher menerapkan kebijakan ini juga pada konfigurasi yang sudah ada setiap kali dijalankan. Grup tetap dinonaktifkan dan sesi dipisahkan per akun kanal/pengirim. `commands.allowFrom.whatsapp: []` menutup perintah administrasi native gateway melalui DM; administrasi dilakukan dari CLI. Identitas owner lama dan credential sesi tidak diubah. Pesan biasa tetap menuju bridge SDJ, dengan akses data ditentukan oleh login Google serta koneksi tracker peserta sendiri.

Bridge memotong dispatch sebelum model dan memakai backend untuk interpretasi/write. Heartbeat dan cron bawaan gateway SDJ dinonaktifkan; tidak ada model/credential default gateway untuk interpretasi pesan peserta. Group, bot echo, metadata hilang, dan account yang tidak cocok tidak diteruskan. Pada OpenClaw 2026.10.3 `before_dispatch.conversationId` dapat berisi recipient bot; tujuan balasan DM harus memakai `senderId` tepercaya. Perbaikan ini memiliki regression test dua pengirim.

## Google

Ikuti [panduan tombol per tombol](google-oauth.md). Gunakan `daftar` dari DM nomor peserta mana pun, buka tautan di komputer API, login, pilih file/tab, lalu konfirmasi challenge dari DM asal. Native Google Sheets dan hak edit diwajibkan. API key saja tidak menggantikan consent pengguna.

Refresh token hanya tersimpan terenkripsi di Supabase. Jangan menyalin token/kredensial Google ke konfigurasi atau workspace OpenClaw. Aplikasi memakai `drive.file`; raw tracker dan credential tidak dikirim ke AI.

## Outcome penulisan dan pemulihan

Journal tersimpan sebelum write. API Google tidak menyediakan transaksi lintas Supabase/Sheets atau compare-and-swap terhadap edit manusia. Timeout tidak berarti gagal; tracker ditahan oleh barrier hingga readback/reconcile.

- `verified`: semua sel terbaca sesuai target; baru setelah ini balasan sukses dibuat.
- `failed`: penolakan definitif sebelum ada penulisan yang diterima.
- `conflict`: nilai/struktur berbeda; jangan menimpa atau replay secara buta.
- `uncertain`: hasil belum pasti; rekonsiliasi hanya membaca kembali.
- `needs_review`: belum pasti setelah 15 menit; barrier tetap aktif dan memerlukan pemeriksaan.
- `delivery_unknown`: balasan mungkin sudah terkirim; jangan menjalankan ulang command atau mengirim otomatis tanpa bukti.

Untuk pemeriksaan unresolved, gunakan user ID/operation ID dari tiket yang sah dan role yang sesuai. Jangan menghapus journal/barrier hanya untuk membuka writer. Simpan bukti metadata, periksa target pada akun yang berwenang, dan putuskan outcome secara terkontrol. Belum tersedia UI operator untuk menyelesaikan kasus needs_review.

## Retensi dan penghapusan

`pnpm maintenance` menjalankan satu putaran; launcher menjalankannya setiap jam dengan role `sdj_maintenance`. Role HTTP/worker berbeda dari role pemeliharaan.

Teks terminal dibersihkan setelah tujuh hari. Payload journal/outbox terminal dibersihkan setelah tiga puluh hari dengan menjaga FK undo dan dependency baru. Unresolved mutation tetap dipertahankan. Penghapusan akun yang sudah dikonfirmasi menunggu job/delivery aktif, membuat tombstone, lalu menghapus data aplikasi milik peserta. File Google Sheets tetap ada. Putus koneksi meniadakan refresh token lokal; peserta juga dapat mencabut akses aplikasi dari pengaturan akun Google.

Retensi isi SQLite/transkrip gateway OpenClaw perlu diaudit sebelum pilot; retensi backend bukan jaminan retensi seluruh penyimpanan kanal.

## Backup dan restore

Backup database dan tiga key enkripsi/HMAC harus disimpan terpisah serta terlindungi. Jangan merotasi `ENCRYPTION_KEY` atau `LOOKUP_HMAC_KEY` secara sembarang pada database yang sudah berisi data. Tanpa key lama, ciphertext tidak dapat dipulihkan.

Backup/restore Supabase menggunakan kemampuan yang tersedia pada paket project; jangan mengasumsikan PITR aktif. Simpan migration, versi aplikasi, dan tombstone penghapusan di luar snapshot yang akan direstore. Setelah restore: jangan langsung menyalakan writer; terapkan tombstone penghapusan terbaru, periksa lease/journal/outbox unresolved, validasi RLS/role, lalu jalankan read-only reconciliation sebelum membuka trafik.

Restore penuh belum diuji. Ini gate sebelum pilot. Jangan membuat dump data peserta untuk fixture.

## Tooling dan credential

Migration aktif ada di `supabase/migrations`. Runtime tidak memakai role postgres/service_role atau transaction pooler port 6543. Perubahan schema dilakukan melalui konektor Supabase atau `DATABASE_URL_MIGRATOR` khusus administrasi.

`.env`, `.local/`, sesi WhatsApp, hasil evaluasi lokal, serta prototype `legacy/` diabaikan Git. `.env.example` hanya placeholder. Key lama pernah ada pada contoh/proses chat: ganti credential yang terekspos sebelum membuka aplikasi bagi peserta lain. Jangan memasukkan secret pengganti ke chat.
