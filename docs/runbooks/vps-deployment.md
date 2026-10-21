# Deployment VPS Jagoan Hosting

Checkpoint 19 Oktober 2026, Asia/Jakarta. Server Rocky Linux 8.10 x86_64, IP `38.9.46.213`, paket 2 vCPU/2 GB. Node 24.16.0, pnpm 12.11.2, OpenClaw dan plugin WhatsApp 2026.10.3. Runtime memakai systemd dan Caddy. Database tetap Supabase utama dengan role terbatas, session pooler, dan key enkripsi/lookup yang sama. Tidak menjalankan database tambahan pada VPS.

## Status yang telah diverifikasi

Deployment 19 Oktober 2026, sekitar 16.44 WIB: release `20261019T090338Z` mengaktifkan [percakapan dan reminder](../adr/0012-conversation-and-reminders.md). 241 unit, 34 E2E, 24 integration sintetis di VPS dan 17 evaluasi percakapan lulus. API/worker/proxy/gateway/Caddy aktif; API/gateway ready dan WhatsApp linked/running/connected true. Satu pesan contoh dikirim sekali ke akun uji yang ditunjuk pemilik, receipt tersimpan dan tampilan dikonfirmasi rapi. Tidak menulis tracker nyata. `REMINDERS_ENABLED=true`; lima peserta memenuhi syarat, tanpa backfill jadwal lama. Jadwal tetap 07.00, 13.00, 20.00 WIB; peserta dapat mengirim `reminder mati`.

Gateway direstart karena bridge memperbaiki konversi bold native ke CommonMark sebelum adapter WhatsApp. Launcher harus berjalan dari working directory release aktif; ia menghitung ulang path plugin. Beri jendela startup hingga 180 detik dan periksa ready serta connected, bukan hanya active. Percobaan awal dengan jendela 40 detik pulih ke release sebelumnya sebelum pesan contoh dikirim. Jangan menjalankan status helper dari `/root`: lakukan `cd /opt/sdj/current` agar launcher relatif ditemukan.

Rollback memakai release `20261019T062833Z`, `/root/sdj-backend-before-conversation-20261019T090338Z.env` dan `/root/sdj-gateway-before-conversation-20261019T090338Z.json` (root-only). Untuk mematikan reminder saja, pulihkan flag false lalu restart API/worker, tanpa restart gateway. Salinan environment sebelum mengaktifkan reminder berada di `/root/sdj-backend-before-reminders-enable-20261019.env`. Batalkan reminder pending sebelum rollback segera; kode lama juga menolak claim reminder melalui overload dua parameter. Migrasi aditif tetap dipertahankan; cascade kejadian menjaga penghapusan akun oleh maintenance lama. Panduan lengkap: [reminder](reminders.md).

Percobaan 9Router, 19 Oktober sekitar 15.50 WIB: staging dipatok ke 0.5.104/commit `87a74e1bda3677193c6f71a7e2100c90311f0689`, namun dihentikan saat dependensi karena headroom RAM turun ke 132–141 MiB. Build unit `sdj-9router-build` berhenti dengan SIGTERM dari monitor; tidak ada runtime 9Router atau dashboard publik. Source di `/opt/9router/releases/87a74e1bda3677193c6f71a7e2100c90311f0689`, data staging `/var/lib/9router/staging`, observasi `/root/sdj-9router-build-observations.jsonl`. API/worker/public/gateway tetap pada PID semula, ready dan NRestarts nol. Release SDJ tetap `20261019T062833Z`; rincian kapasitas dan pekerjaan yang belum dikerjakan pada [ADR 0011](../adr/0011-ninerouter-capacity-gate.md). Jangan menyalakan ulang staging sebelum kapasitas memadai. Upgrade VPS tidak dilakukan otomatis.

Deployment terbaru 19 Oktober 2026, 13.29 WIB: release `20261019T062833Z` menambahkan OpenRouter gratis dan pemulihan fallback AI ([ADR 0010](../adr/0010-openrouter-free-fallback.md)). Build/204 unit test VPS, smoke OpenRouter biaya 0 dan smoke Groq lulus sebelum aktivasi. 30 E2E dan seluruh pemeriksaan lokal lulus. Registry OpenRouter enabled; Groq dipulihkan setelah smoke. API/worker/proxy/gateway/Caddy aktif dan ready; gateway tetap berjalan tanpa restart. Target memerlukan consent provider v2 melalui DM; onboarding v1 tidak dianggap menyetujui provider baru. Rollback mengembalikan `/opt/sdj/releases/20261018T233308Z` dan salinan environment `/root/sdj-backend-before-openrouter-20261019T062833Z.env` (root-only), lalu restart API/public/worker. Jangan restart gateway atau menghapus riwayat migrasi aditif. Key hanya di environment backend; jangan memasukkannya dalam paket source, log atau gateway.

Deployment terbaru 19 Oktober 2026, 06.34 WIB: release `20261018T233308Z` mengaktifkan normalisasi seluruh input ([ADR 0009](../adr/0009-complete-tracker-normalization.md)). Semua aturan input menjadi standar; nilai jelas dikonversi dan nilai tidak valid diarsipkan lalu dikosongkan. Backup terverifikasi pada tab tersembunyi file yang sama mendahului perubahan. Browser melanjutkan batch HTTP 202 otomatis dan memulihkan refresh. Build, seluruh 191 unit test sintetis di VPS, verifikasi patch dan HTTPS publik lulus. API/worker/proxy aktif, API/gateway ready; gateway tidak direstart. Release `20261018T161906Z` tersedia untuk rollback kode. Rollback tidak mengembalikan isi spreadsheet; rekam pemulihan tetap di file. Tidak memakai tracker nyata atau mengirim chat peserta untuk tes deployment.

Deployment terbaru 18 Oktober 2026, 23.19 WIB: release `20261018T161906Z` menambahkan koreksi nilai boolean native pada aktivitas angka ([ADR 0008](../adr/0008-legacy-boolean-numeric-inputs.md)). TRUE/FALSE disimpan dan diverifikasi pada note sel sebelum dikosongkan; angka valid, rumus dan checkbox aktivitas boolean dipertahankan. Build, 55 tes spreadsheet sintetis di VPS, verifikasi patch dan HTTPS publik lulus. API/worker/proxy dimuat ulang; gateway mempertahankan sesi tanpa restart. Release `20261018T160448Z` tersedia untuk rollback. Tidak memakai tracker nyata sebagai tes deployment.

Deployment terbaru 18 Oktober 2026, 23.04 WIB: release `20261018T160448Z` mengaktifkan perbaikan otomatis aturan input saat onboarding ([ADR 0007](../adr/0007-automatic-input-validation-repair.md)). Build server, 45 tes spreadsheet sintetis, verifikasi patch, dan probe HTTPS publik lulus. API/worker/proxy dimuat ulang; gateway mempertahankan sesi dan tidak direstart. Release `20261018T140106Z` tersedia untuk rollback. `TrackerGateway.validate` sekarang dapat menulis aturan file peserta; gunakan fixture sintetis untuk tes dan jangan menjalankan helper probe read-only lama yang memanggil validate pada tracker nyata.

- SSH dengan key deployment berhasil; aplikasi berjalan sebagai user sistem, bukan root.
- API, satu worker, proxy publik, gateway, Caddy, dan timer maintenance terpasang sebagai layanan otomatis.
- API `127.0.0.1:3000/health/ready` mengembalikan `ready` dari VPS.
- Sesi WhatsApp dipindahkan setelah memastikan gateway lokal tidak berjalan. Setelah restart gateway di VPS: linked/running/connected semuanya true.
- Setelah pemulihan izin plugin dan grant pesan, pengguna mengonfirmasi pesan baru “bantuan” menghasilkan panduan SDJ. Startup kini memeriksa hook/service bridge, bukan hanya koneksi WhatsApp.
- DNS publik kini menjawab IP VPS. HTTPS dengan verifikasi sertifikat normal berhasil: GET /, /privacy, /terms menghasilkan HTML 200; internal/health publik 404. Blokir DNS/HTTPS telah teratasi; onboarding Google nyata pada domain baru masih perlu diuji.
- API 3000, proxy 3001, gateway 18789, dan admin Caddy 2019 hanya mendengarkan loopback. Firewall membuka SSH/HTTP/HTTPS. Jalur internal melalui proxy publik mengembalikan 404.
- 86 unit + 28 E2E lulus; typecheck/lint/build/format lulus. Tidak menjalankan integration fixtures pada database dengan worker aktif, tidak mengirim pesan uji ke peserta, dan tidak menulis tracker untuk verifikasi deployment.

## Susunan server

| Lokasi | Isi |
| --- | --- |
| `/opt/sdj/current` | Symlink ke release aplikasi |
| `/opt/sdj/releases/20261018T095000Z` | Release awal |
| `/opt/sdj/node` | Node yang dipin |
| `/opt/sdj/shared/openclaw` | Dependency gateway dengan lock Linux |
| `/etc/sdj/backend.env` | Secret runtime API/worker, root:sdj 0640 |
| `/etc/sdj/maintenance.env` | Hanya koneksi role maintenance |
| `/etc/sdj/gateway.env` | Hanya credential kanal/account, tanpa Google/DB/AI |
| `/var/lib/sdj-gateway/state` | Sesi dan konfigurasi WhatsApp, user gateway saja |
| `/etc/caddy/Caddyfile` | Domain app → proxy route publik |

Gateway memakai heap 512 MB, batas cgroup 1150 MB, serta compile cache persisten. Swap 2 GB disiapkan untuk lonjakan instalasi/runtime. API/worker masing-masing dibatasi 384 MB. Monitor memori sebelum menambah worker; upgrade kapasitas bukan pengganti pemeriksaan pemakaian aktual.

## DNS dan HTTPS

Pembaruan 18 Oktober: Google DNS dan Cloudflare sudah menjawab 38.9.46.213 untuk domain app. HTTPS telah diverifikasi dari internet. Catatan SERVFAIL dan teks tiket di bawah adalah riwayat diagnosis, bukan blocker aktif.

Domain memakai `ns1.idwebhost.id` dan `ns2.idwebhost.id`. Pengguna melaporkan record berikut sudah disimpan di DNS Management:

| Host | Type | Address |
| --- | --- | --- |
| `app` | A | `38.9.46.213` |

Alamat aplikasi yang disiapkan: `https://app.sdj-rumah-kepemimpinan.my.id`. Periksa authoritative DNS serta resolver publik. Bila server authoritative tetap menolak permintaan, minta penyedia DNS mengaktifkan/memperbaiki zona; menunggu cache saja tidak memperbaiki zona yang belum dilayani. Jangan mengubah nameserver secara acak atau menghapus MX/TXT yang dipakai layanan lain.

Teks tiket yang dapat dikirim pemilik: “Mohon periksa aktivasi zona DNS sdj-rumah-kepemimpinan.my.id pada ns1.idwebhost.id/ns2.idwebhost.id. Record A app → 38.9.46.213 sudah disimpan, tetapi resolver publik memperoleh SERVFAIL dengan keterangan nameserver REFUSED. Mohon pastikan zona benar-benar dilayani authoritative nameserver.”

Sesudah DNS menjawab IP VPS, Caddy mencoba penerbitan TLS otomatis. Verifikasi sertifikat dari internet, homepage/privasi/ketentuan HTTP 200, dan internal/health publik 404. Jangan menyatakan onboarding publik berfungsi sebelum TLS dan OAuth diuji.

Panduan DNS penyedia: [subdomain melalui Manage DNS](https://tutorial.idwebhost.com/cara-membuat-sub-domain-di-manage-dns-domain/). Domain root/website Diskon belum dipindahkan; backend memakai subdomain app.

## Google Console

Pada OAuth client web di project Google yang sama, tambahkan:

- Authorized JavaScript origins: `https://app.sdj-rumah-kepemimpinan.my.id`
- Authorized redirect URIs: `https://app.sdj-rumah-kepemimpinan.my.id/connect/google/callback`
- API key Picker website restriction: `https://app.sdj-rumah-kepemimpinan.my.id/*`; pertahankan izin origin lain yang masih diperlukan.

Origin tidak berisi path. Callback harus sama persis, tanpa slash tambahan. Selesaikan Test users atau publikasi/Branding yang diminta Google agar akun peserta lain dapat login. Secret dan project tetap sama; tidak perlu membuat client baru. Pengguna telah mengonfirmasi origin, callback, dan restriction Picker sudah ditambahkan. Login nyata tetap perlu diuji sesudah DNS/TLS siap.

## Operasional melalui SSH

Setelah transfer dari Windows, pastikan direktori plugin tidak world-writable. Installer mengekstrak dengan `--no-same-permissions --no-same-owner`; aktivasi menghapus group/other write. OpenClaw akan menolak plugin pada path 777, lalu chat dapat masuk ke agen bawaan. Status WhatsApp connected saja tidak membuktikan bridge SDJ aktif.

Launcher memerlukan hasil `plugins inspect sdj-bridge --runtime --json` yang membuktikan hook before_dispatch, service sdj-outbox, dan grant allowConversationAccess. Kegagalan menghentikan gateway sebelum chat dibuka. Grant hanya berlaku pada bridge operator; Google/DB/AI key tetap pada backend. Jangan mengatasi error login AI native dengan memasukkan credential tambahan ke gateway sebelum memeriksa bridge.

```bash
systemctl is-active sdj-api sdj-worker sdj-public sdj-gateway caddy
systemctl is-enabled sdj-api sdj-worker sdj-public sdj-gateway caddy sdj-maintenance.timer
curl --fail http://127.0.0.1:3000/health/ready
curl --fail http://127.0.0.1:18789/readyz
systemctl show sdj-gateway -p MemoryCurrent -p NRestarts
systemctl list-timers sdj-maintenance.timer
```

Restart komponen hanya bila diperlukan. Jangan menjalankan gateway Windows dan VPS dengan sesi WhatsApp yang sama. Jangan menjalankan `pnpm dev`/worker lokal terhadap database utama bersamaan tanpa kebutuhan. `systemctl restart sdj-gateway` mempertahankan sesi di `/var/lib/sdj-gateway/state`.

Status kanal tanpa menampilkan nomor/token:

```bash
cd /opt/sdj/current
runuser -u sdj-gateway -- env HOME=/var/lib/sdj-gateway NODE_OPTIONS=--max-old-space-size=512 SDJ_ENV_FILE=/etc/sdj/gateway.env SDJ_OPENCLAW_HOME=/opt/sdj/shared/openclaw OPENCLAW_STATE_DIR=/var/lib/sdj-gateway/state /opt/sdj/node/bin/node deploy/check-gateway.mjs
```

Snapshot sebelum upgrade: backup release, `/etc/sdj`, state gateway yang sedang dihentikan, dan data Caddy pada lokasi privat di luar document root. Simpan backup terenkripsi di luar VPS dan uji pemulihannya. Backup terjadwal di luar VPS serta uji restore belum disiapkan pada checkpoint ini. Jangan menghapus/mengganti encryption/lookup key; token Google lama memerlukannya.

## Mengulang deployment

Gateway 2026.10.3 memerlukan patch ingress milik proyek. `install-release.sh` menjalankan `node scripts/patch-whatsapp-ingress.mjs /opt/sdj/shared/openclaw` sebagai root sebelum aktivasi. Launcher production hanya memverifikasi patch; jangan memberinya izin menulis dependency bersama. Setelah install ulang npm, pasang patch kembali. Versi atau checksum upstream berbeda menghentikan pemasangan, sehingga upgrade perlu review patch dan regression test dahulu. Untuk pemeriksaan tanpa perubahan:

```bash
node scripts/patch-whatsapp-ingress.mjs /opt/sdj/shared/openclaw --check
```

Diagnostik `SDJ_WHATSAPP_CONTENT_PENDING` berarti envelope sementara tanpa isi dilewatkan agar konten hasil dekripsi dengan ID yang sama tetap diterima; bukan tanda pesan sudah diproses backend. `SDJ_WHATSAPP_IDENTITY_UNRESOLVED` menahan event pada mekanisme retry antrean native tanpa menebak nomor dari LID. `SDJ_WHATSAPP_ACCESS_DENIED` menandai penolakan kebijakan DM. Log hanya berisi kode dan hash key event. Hubungkan hash itu dengan metadata antrean, jangan aktifkan dump chat/credential untuk diagnosis. Retry native tetap memakai batas/retensi bawaan OpenClaw yang sudah dipin; ini bukan replay mutation tracker.

Sumber skrip ada di `deploy/`. `bootstrap-rocky.sh` hanya untuk persiapan server baru yang sudah diperiksa. `install-release.sh <YYYYMMDDTHHMMSSZ>` memasang release baru dan mengaktifkan backend; stop layanan terkait sebelum memperbarui dependency gateway bersama. `scripts/export-vps.mjs` mengekspor secret runtime terpilih dari `.env` utama ke folder `.local/deployment/vps` yang diabaikan Git. Lock gateway Linux yang telah berhasil dipasang ada di `deploy/openclaw/`.

Arsip sumber harus mengecualikan `.env`, `.local`, credential, sesi, private key SSH, node_modules, dan output build. Kirim secret dan sesi terpisah melalui SSH; pasang permission sebelum menyalakan layanan. Tidak menjalankan migrasi SQL atau rotasi key sebagai langkah deployment rutin. Untuk rollback, hentikan layanan yang terdampak, arahkan symlink current ke release sebelumnya yang kompatibel, lalu start kembali; perubahan database memerlukan rencana pemulihan tersendiri.
