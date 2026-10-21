# Template dan kanal

Katalog 15 aktivitas: `packages/domain/src/activities.ts`. Template awal memakai label kolom A dan tanggal asli baris 7 mulai kolom J. Adapter mencari label/header, memeriksa fingerprint, formula, proteksi, dan tipe nilai; range tidak berasal dari output model.

Kanal memakai OpenClaw 2026.10.3 beserta `@openclaw/whatsapp` 2026.10.3 dan bridge `packages/openclaw-bridge`. Jalankan `pnpm whatsapp:pair` untuk QR, lalu `pnpm openclaw gateway run`. Konfigurasi serta sesi utama berada di `.local/openclaw-state`, dibuat launcher dan diabaikan Git.

Tidak ada layanan webhook pihak ketiga atau endpoint `/webhook/message` pada implementasi aktif. Ingress produk adalah `/internal/v1/channel-events` dengan HMAC, timestamp, nonce, dan scope akun.
