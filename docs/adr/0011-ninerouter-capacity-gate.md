# ADR 0011 — Staging 9Router dan gerbang kapasitas VPS

Tanggal: 19 Oktober 2026. Status: staging dihentikan; routing produksi tetap langsung sesuai ADR 0010. Implementasi integrasi callback/kuota dan dashboard belum dilanjutkan karena pemeriksaan kapasitas awal tidak lolos. Tidak ada aktivasi 9Router, migrasi database baru, atau perubahan persetujuan peserta.

## Lingkup yang diminta

Pemilik menyetujui 9Router 0.5.104, commit `87a74e1bda3677193c6f71a7e2100c90311f0689`, berjalan bersama SDJ pada VPS sekarang tanpa upgrade otomatis. Dashboard direncanakan pada `router.sdj-rumah-kepemimpinan.my.id`, dengan DNS A ke `38.9.46.213`, HTTPS/login dan API inferensi privat. Gerbang kapasitas harus melindungi layanan SDJ; kegagalan kapasitas menghentikan staging dan mempertahankan router lama. Upgrade merupakan keputusan terpisah.

## Persiapan dan batas proses

Archive sumber dari URL commit resmi diverifikasi SHA-256 `19ef5a68603672c8efe9b140e917fcd71a0b28be930600e2bbfa914819f1ea27`. Sumber ditempatkan pada `/opt/9router/releases/87a74e1bda3677193c6f71a7e2100c90311f0689`. Pengguna sistem `ninerouter` dan data staging `/var/lib/9router/staging` dibuat, tanpa menyalin credential provider atau data peserta ke 9Router.

Patch berversi `deploy/9router/0001-bounded-build.mjs` mengunci versi/anchor dan menerapkan satu worker serta optimasi memori Webpack. Unit build oneshot memakai CPUQuota 50%, RAM 512 MiB, Node heap 384 MiB, core dump nonaktif, prioritas rendah dan tanpa auto-restart/autostart. Dependency lock dibuat sekali dari sumber yang tidak menyertakannya, lalu dipakai npm ci; percobaan ini belum menyelesaikan fase dependensi sehingga belum menghasilkan build produksi.

Server Rocky Linux 8.10/systemd 239 memakai cgroup v1. Batas RAM diatur langsung ke 512 MiB dan gabungan RAM+swap 1 GiB. Cgroup v1 tidak memiliki batas swap terpisah seperti `MemorySwapMax` pada cgroup v2: swap diawasi sampler dan staging dihentikan bila mencapai 512 MiB; ini pengawasan proses, bukan klaim hard limit kernel swap terpisah. Pemasangan runtime dengan batas 192/320/128 MiB belum dilakukan. Monitor juga melindungi headroom host: kurang dari 150 MiB selama tiga sampel berurutan menghentikan unit build. API/gateway diperiksa selama proses, dan baseline swap dicatat sebelum start pada tooling yang disimpan.

## Hasil aktual

Staging dipersiapkan 19 Oktober 2026 sekitar 15.50 WIB. Saat npm menyelesaikan dependensi, sampel RAM tersedia hanya 132, 141, 141 MiB. Resident proses build teramati 264–278 MiB; swap cgroup teramati nol. Monitor menghentikan unit dengan alasan `HOST_MEMORY_HEADROOM` dan SIGTERM, bukan menyatakan adanya OOM. Belum menjalankan kompilasi Next.js, uji runtime 15 menit, smoke provider melalui 9Router, atau uji aktivasi.

Sesudah stop, RAM tersedia pulih ke sekitar 346 MiB. API dan gateway tetap ready; API/worker/public/gateway memiliki PID dan waktu aktif yang sama, NRestarts nol. Gateway tetap berjalan sejak 18 Oktober 19.25 WIB. Symlink produksi tetap `/opt/sdj/releases/20261019T062833Z`. Source, service build yang berhenti dan observasi dipertahankan agar percobaan dapat dilanjutkan setelah kapasitas memadai; tidak ada dashboard/listener 9Router yang dipublikasikan.

Pemeriksaan workspace sesudah staging: 204 unit test, 30 E2E, typecheck dan build SDJ lulus. Lint melaporkan empat import duplikat dan format check melaporkan 25 file pada perubahan profil/pengingat yang sudah berada di workspace; file aplikasi tersebut tidak diubah atau dideploy oleh pekerjaan 9Router ini. Pemeriksaan ini bukan kelulusan tes integrasi 9Router yang belum diimplementasikan.

Cadangan root-only `/root/sdj-before-9router-20261019T085004Z` memuat environment backend, Caddyfile, release dan status layanan awal. Observasi tanpa data peserta tersedia pada `/root/sdj-9router-build-observations.jsonl`. DNS `router.sdj-rumah-kepemimpinan.my.id` belum ditemukan pada pemeriksaan; konfigurasi DNS/Caddy produksi tidak diubah.

## Keputusan pemilik: kembali ke routing langsung

Pada 19 Oktober 2026 pemilik membatalkan kelanjutan 9Router dan upgrade VPS. Produksi tetap memakai router langsung sesuai ADR 0010, termasuk fallback provider yang sudah tersedia. Unit staging `sdj-9router-build.service` dihentikan, tidak memiliki autostart, dan status gagal dibersihkan. Artefak staging serta cadangan dipertahankan tanpa proses berjalan. Jangan melanjutkan pemasangan 9Router atau upgrade tanpa permintaan baru dari pemilik.

## Melanjutkan pekerjaan jika diminta kembali

Kapasitas perlu ditambah atau disediakan terpisah melalui keputusan pemilik, lalu gerbang build/runtime diuji kembali. Tooling dapat dijalankan ulang melalui monitor `--start` pada sumber staging yang sama setelah prasyarat tersebut dipenuhi. Jangan menaikkan limit build atau menghentikan gateway untuk memaksakan kelulusan.

Sesudah build dan kapasitas lolos, masih harus dikerjakan: adapter backend dan callback HMAC berikat actor/command/lease, reservasi attempt idempotent/RLS, pembatasan provider/schema/gratis/consent, penghilangan log isi request 9Router, dashboard HTTPS, seluruh pengujian dan monitoring aktivasi sesuai rencana pemilik. Memasang proses 9Router saja bukan bukti integrasi tersebut selesai.

Sumber: [upstream yang dipatok](https://github.com/decolua/9router/tree/87a74e1bda3677193c6f71a7e2100c90311f0689), [optimasi memori Next.js](https://nextjs.org/docs/app/guides/memory-usage).
