# Status implementasi SDJ Assistant

Checkpoint: 19 Oktober 2026, Asia/Jakarta. Implementasi v0.2.0. Baca [ADR 0001](adr/0001-primary-environment-full-mvp.md) untuk perubahan lingkup dari desain v1.

## Percakapan dan reminder, 19 Oktober — aktif di VPS

[ADR 0012](adr/0012-conversation-and-reminders.md) menerapkan renderer WhatsApp, bahasa aku/kamu, consent v2 yang konsisten, pending yang tidak hilang ketika disela perintah/klarifikasi langsung, parser lebih luas, dan prioritas AI dua percobaan dengan deadline luar 12 detik. Nama Google memakai izin profile serta alur pembaruan terpisah. Reminder pagi/siang/malam WIB memakai template backend tanpa model atau pembacaan Sheets, dengan preferensi peserta, dedupe, lease, kedaluwarsa, dan pemeriksaan penerima saat claim.

Migrasi `20261019085415_conversation_reminders.sql` dan `20261019092921_reminder_rollback_cleanup.sql` diterapkan melalui konektor. RLS/grant dan composite FK diperiksa pada fixture. Cascade untuk pemulihan maintenance lama diverifikasi dengan transaksi sintetis tanpa job/delivery lalu ROLLBACK. Tidak mengubah nilai tracker nyata.

241 unit test, 34 E2E, typecheck/lint/build/format lulus. Integration dari VPS lulus **24/24** pada account sintetis terpisah; worker dihentikan selama pengujian dan dipulihkan otomatis. Percobaan integration dari Windows sempat mengalami timeout koneksi pooler; itu tidak dihitung sebagai bukti kelulusan. Evaluasi percakapan parser+Groq **17/17** lulus sesudah perbaikan pola tanggal, kontrol increment dan klarifikasi tanpa pending. Ini bukan evaluasi seluruh provider atau dataset dasar 100 kasus. Report ber-fingerprint berada pada `.local/evaluation/` dan hanya memakai data sintetis. Evaluasi memakai batas sementara dua request/menit, di bawah dokumentasi batas model gratis; batas produksi konservatif tidak dinaikkan.

Release `/opt/sdj/releases/20261019T090338Z` aktif. API/worker/proxy/gateway/Caddy aktif, API dan gateway ready, akun WhatsApp linked/running/connected true. Gateway direstart untuk memuat bridge baru dengan sesi yang tetap tersimpan; startup diberi jendela sampai 180 detik. Percobaan awal dengan jendela 40 detik di-rollback sebelum pesan contoh dicoba kirim. Pemeriksaan rollback kini menghentikan aktivasi dengan exit nonzero, bukan mencetak status sukses setelah pemulihan.

Satu pesan contoh ke akun yang ditunjuk pemilik tercatat sent dengan satu attempt dan receipt platform, tanpa panggilan AI atau penulisan Sheets; pemilik mengonfirmasi bold, bullet dan quote tampil rapi. `REMINDERS_ENABLED=true` pada environment API/worker sesudah verifikasi. Lima peserta memenuhi syarat saat aktivasi; tidak ada reminder lama yang di-backfill, antrean reminder saat 16.44 WIB kosong, dan seluruh identitas fixture sintetis telah dibersihkan. Jadwal terdekat malam ini 20.00 WIB. P95 percakapan dan pengiriman terjadwal pertama belum dibuktikan oleh satu pesan contoh.

HTTPS halaman dan `/connect/profile.js` 200; rute internal/health tetap 404 dari publik. Release sebelumnya `20261019T062833Z` serta backup environment dan konfigurasi gateway root-only tersedia untuk rollback. Lihat [runbook reminder](runbooks/reminders.md).

## Staging 9Router, 19 Oktober — dibatalkan pemilik

Pemilik memilih kembali ke routing langsung dan membatalkan upgrade VPS. Staging 9Router tetap nonaktif tanpa autostart; tidak ada perpindahan routing atau perubahan release produksi. Jangan melanjutkan staging tanpa permintaan baru.

[ADR 0011](adr/0011-ninerouter-capacity-gate.md) mencatat percobaan menjalankan 9Router 0.5.104 pada VPS sekarang, tanpa upgrade otomatis. Source commit dan checksum diverifikasi; OS user, direktori staging, patch build satu worker dan unit systemd terbatasi dipasang. Saat pemasangan dependensi, RAM tersedia turun ke 132–141 MiB dan monitor menghentikan proses sesuai perlindungan headroom 150 MiB. Source belum berhasil dikompilasi, runtime 15 menit dan integrasi routing/callback/dashboard belum dikerjakan. Tidak mengaktifkan provider, menyalin credential ke 9Router, membuat migrasi atau mengubah data peserta.

Sesudah penghentian, RAM tersedia pulih sekitar 346 MiB, API/gateway ready, PID/waktu aktif layanan SDJ sama dan NRestarts nol. Release publik tetap `20261019T062833Z`, gateway tidak direstart. Environment dan Caddy dicadangkan root-only; DNS router belum tersedia dan link SDJ tetap sama. Kelanjutan memerlukan kapasitas yang memadai serta DNS sebelum dashboard publik; tidak boleh mengklaim 9Router sudah aktif.

## OpenRouter gratis dan pemulihan AI, 19 Oktober — dideploy

[ADR 0010](adr/0010-openrouter-free-fallback.md) menambahkan OpenRouter sebagai provider keempat dengan model gratis, endpoint terikat, schema strict, pembatasan harga nol dan `data_collection: deny`. Consent provider v2 diminta melalui DM tanpa pairing ulang; SQL menolak OpenRouter untuk consent lama atau izin yang dicabut. Key yang diberikan pemilik tersimpan pada environment rahasia, tidak pada source atau tabel. Migrasi aditif diterapkan dan target baru diaktifkan sesudah staging. Transaksi fixture tanpa job/delivery membuktikan gate consent lalu seluruhnya di-rollback; security advisors tidak menghasilkan temuan.

Kegagalan JSON Groq tidak lagi mematikan provider secara menetap; timeout dibedakan dari network dan output terpotong ditolak. Fallback maksimal empat panggilan/30 detik; parser menerima pesan beberapa baris, status harian dan putuskan koneksi tanpa AI. 204 unit test, 30 E2E, typecheck/lint/format/build lulus lokal. Smoke OpenRouter HTTP 200, hasil benar dan cost 0; smoke Groq HTTP 200 dengan output/reasoning baru. Tidak memakai data peserta atau menulis Sheets/mengirim DM untuk pengujian.

Release `20261019T062833Z` aktif pada 19 Oktober 2026 pukul 13.29 WIB. Build dan 204 unit test di VPS lulus, patch WhatsApp terverifikasi; smoke modul build OpenRouter HTTP 200 (9,15 detik, cost 0), Groq HTTP 200 (1,00 detik). Registry OpenRouter enabled, bucket Groq dipulihkan. API/worker/proxy/gateway/Caddy aktif; API/gateway ready, NRestarts nol, gateway tidak direstart. HTTPS halaman/legal/aset 200, recovery sesi dan POST tanpa sesi 401, rute privat 404. Release sebelumnya `20261018T233308Z` dan environment sebelumnya dipertahankan untuk rollback; migrasi aditif tetap kompatibel. Pemakaian nyata peserta berikutnya tetap memerlukan persetujuan provider v2 melalui DM, tanpa pairing ulang.

## Normalisasi seluruh input, 19 Oktober — dideploy

[ADR 0009](adr/0009-complete-tracker-normalization.md) menangani kasus Al-Matsurat Petang L18 dan mengganti normalisasi parsial menjadi satu proses untuk 15 aktivitas/semua tanggal yang dikenali. Konversi jelas mengikuti locale dan katalog, termasuk TRUE/FALSE teks, 0/1 pada checkbox dan pasangan checkbox custom; isian lain atau di luar batas diarsipkan lalu dikosongkan. Semua aturan menjadi standar katalog. Rumus tepat di input diarsipkan dan diganti snapshot hasil valid atau blank; rumus rekap/target/bobot, catatan sel dan tampilan dipertahankan.

Backup terstruktur pada tab tersembunyi file yang sama diverifikasi sebelum input write, dengan manifest pending, checksum, validasi ulang wilayah/tujuan dan status verified/conflict. Batch maksimal 500 input/1 MB; bagian JSON maksimal 40.000 unit UTF-16. HTTP 202 dan token AES-GCM terikat sesi melanjutkan proses otomatis; sessionStorage memulihkan refresh, gangguan sementara memakai backoff dan tidak menggandakan perubahan yang sudah terbukti tersimpan. Kandidat/challenge hanya sesudah scan akhir selesai. API lama yang tidak mendukung progres diarahkan refresh; tab backup tidak ditampilkan dalam pilihan tracker. Tidak mengubah schema/env/credential/scope dan tidak mengirim data ke AI.

191 unit test, 28 E2E, typecheck, lint, format check dan build lulus. Tes mencakup L18 dengan 0/1/angka lain/teks TRUE/FALSE/teks asing, locale dan perubahan locale, seluruh jenis aktivitas, rumus input, cadangan panjang Unicode, 701 tanggal dengan batch 500, timeout setiap fase termasuk alokasi, readback yang tidak menerapkan perubahan, refresh adapter/browser, respons akhir yang hilang, edit bersamaan/perubahan fingerprint, kuota Google dengan jeda otomatis 61 detik, token silang konteks/rusak/kedaluwarsa, tab cadangan yang tidak masuk Picker dan rencana backup yang dimanipulasi. Fixture seluruhnya sintetis; tidak menjalankan integration database, login Google peserta, menulis tracker nyata atau mengirim chat peserta untuk pengujian.

Release VPS `20261018T233308Z` aktif pada 19 Oktober 2026 pukul 06.34 WIB. Build dan seluruh 191 unit test di staging VPS lulus sebelum aktivasi, berikut verifikasi patch WhatsApp dan modul normalisasi hasil build. API, worker, proxy, gateway dan Caddy aktif; API/gateway ready dan NRestarts API/worker/proxy/gateway nol. Gateway tetap berjalan sejak 18 Oktober pukul 19.25 WIB tanpa restart saat deployment. HTTPS publik memverifikasi homepage/privasi/ketentuan, JS kelanjutan dan semua aset 200, GET/HEAD tautan sintetis 200 tanpa konsumsi, recovery sesi 401, POST tanpa sesi 401 dan rute privat 404. Release `20261018T161906Z` tersedia untuk rollback kode, tanpa otomatis mengembalikan isi Sheets. Keberhasilan onboarding ulang file teman perlu dibuktikan peserta sendiri melalui validasi dan konfirmasi DM.

## TRUE/FALSE pada input angka, 18 Oktober — dideploy

Pemilik menegaskan bahwa nilai TRUE/FALSE yang sudah tersimpan juga harus dibetulkan tanpa meminta peserta mengedit manual. [ADR 0008](adr/0008-legacy-boolean-numeric-inputs.md) mengganti penolakan lama dengan pengosongan boolean native pada sel aktivitas angka. Nilai asal terlebih dahulu dicatat pada note sel dan diverifikasi, kemudian aturan serta pengosongan dikirim dan dibaca ulang. Angka valid termasuk 0/pecahan, checkbox aktivitas boolean, rumus, target, bobot dan tampilan dipertahankan. Teks/angka lain yang tidak valid, proteksi, merge dan struktur ambigu tetap ditolak.

Halaman dan ketentuan menjelaskan pengosongan sebelum tombol ditekan; hasil browser/DM melaporkan `resetInputCells` dan mengarahkan pencatatan jumlah sebenarnya setelah tersambung. Note yang sudah ada dipertahankan dan marker tidak digandakan saat retry. Perubahan nilai/note/proteksi sebelum clear membatalkan pengosongan. Backup harus terbukti tersimpan sebelum clear, dan validasi belum dianggap berhasil bila clear/aturan/note hasilnya belum terverifikasi. Tidak mengubah schema/env/credential/scope; journal dan undo aktivitas harian tetap memakai alur semula.

145 unit test, 28 E2E, typecheck, lint, format check dan build lulus. Tes baru mencakup TRUE/FALSE, note pribadi, angka 0/pecahan, beberapa tanggal dengan angka valid di antaranya, backup gagal, clear gagal, perubahan bersamaan menjadi angka, timeout sesudah backup/clear serta retry, formula/proteksi/merge dan penolakan sebelum write bila ada nilai lain yang tidak valid. Tidak menggunakan tracker asli atau mengirim chat nyata untuk pengujian ini.

Deployment aktif pada release VPS `20261018T161906Z`, 18 Oktober 2026 pukul 23.19 WIB. Release sebelumnya `20261018T160448Z` dipertahankan untuk rollback. Build server, 55 tes adapter/validasi sintetis di Linux, verifikasi patch WhatsApp dan pemeriksaan modul UI hasil build lulus sebelum aktivasi. API, worker, proxy, gateway dan Caddy aktif; API/gateway ready, NRestarts API/worker/gateway nol. Gateway tidak direstart. HTTPS publik memverifikasi script dengan `resetInputCells`, ketentuan pengosongan TRUE/FALSE, homepage/privasi/CSS/gambar/font 200, GET/HEAD tautan sintetis tanpa cookie, recovery sesi 401, penolakan POST tanpa sesi 401 dan rute privat 404. Belum menjalankan onboarding ulang teman atau mengubah tracker nyata untuk pengujian deployment.

## Perbaikan aturan input otomatis sebelumnya, 18 Oktober — dideploy

[ADR 0007](adr/0007-automatic-input-validation-repair.md) menerapkan permintaan pemilik agar aturan input yang tidak cocok diperbaiki otomatis. Onboarding memeriksa seluruh tanggal dan 15 aktivitas, mempertahankan aturan kompatibel, lalu mengganti aturan yang tidak didukung/tidak kompatibel sesuai katalog. Batch hanya berisi setDataValidation dan dibaca ulang sebelum dinyatakan berhasil. Tidak mengubah nilai, rumus, target, bobot atau tampilan; TRUE/FALSE lama pada aktivitas angka dan nilai lain yang tidak sesuai menolak proses dengan alamat sel, tanpa konversi atau penghapusan. Semua pemeriksaan dilakukan sebelum write apa pun.

Tombol **Validasi & perbaiki** menjelaskan perubahan sebelum ditekan; browser dan teks DM menampilkan jumlah sel yang diperbaiki. Ketentuan menjelaskan bahwa aturan yang sudah diperbaiki tidak dibatalkan oleh pembatalan onboarding maupun undo catatan. Runtime inspect/rekap/write biasa tidak memperbaiki aturan otomatis. Tidak ada migrasi atau perubahan credential/scope. `TrackerGateway.validate` sekarang dapat menulis aturan, sehingga tidak boleh dipakai untuk probe read-only pada tracker nyata.

135 unit test, 28 E2E, typecheck, lint, format check, dan build lulus. Fixture sintetis mencakup semua tanggal, struktur adaptif, data API ber-offset, 701 tanggal/1.402 sel diperbaiki dengan satu batch, preservasi nilai/rumus/format, proteksi/merge/formula pada tanggal lain, domain nilai, penolakan write, readback gagal, dan retry setelah timeout yang sudah diterapkan tanpa write ulang. Tidak menjalankan integration database atau akses Google nyata. Belum memperbaiki spreadsheet teman atau membuktikan onboarding nyata setelah perubahan ini.

Atas permintaan pemilik, deployment publik diaktifkan pada release `20261018T160448Z` (18 Oktober 2026, 23.04 WIB). Build, verifikasi patch WhatsApp, 45 tes adapter/validasi sintetis pada Linux, serta pemeriksaan modul hasil build lulus sebelum pergantian symlink. Percobaan staging pertama berhenti sebelum aktivasi karena konfigurasi Vitest belum ikut paket; paket dilengkapi dan tes kemudian lulus. Release sebelumnya `20261018T140106Z` dipertahankan untuk rollback. API, worker, proxy, gateway dan Caddy aktif; API/gateway ready, NRestarts API/worker/gateway nol. Gateway tidak direstart. Probe HTTPS publik memverifikasi homepage/privasi/ketentuan, script dengan ringkasan jumlah perbaikan, CSS/gambar/font 200, GET/HEAD tautan sintetis 200 tanpa cookie, recovery sesi 401, POST tracker tanpa sesi 401, dan rute internal/aset asing 404. Tidak mengubah env, credential atau database; tidak mengirim chat nyata atau menulis tracker peserta untuk pengujian deployment.

## UI pendaftaran Rumah Kepemimpinan, 18 Oktober

Halaman `/connect` ditata ulang mengikuti referensi pemilik: navigasi membulat, ruang putih, aksen biru/merah/krem, font Plus Jakarta Sans lokal, logo dan maskot yang diberikan. Lingkup mencakup halaman awal tautan, Google/persetujuan AI, pemilihan tracker, konfirmasi WhatsApp dan kedaluwarsa. Homepage/legal tidak didesain ulang. [Runbook UI](runbooks/registration-ui.md) menjelaskan komponen dan kebutuhan packaging aset.

Form menunjukkan langkah sesuai status sesi. Izin AI opsional dipulihkan dari sesi dan mempunyai rincian provider. Tombol memblokir klik ganda selama request; error tetap memungkinkan retry. Ringkasan validasi diikuti petunjuk konfirmasi DM, tanpa klaim aktif sebelum peserta mengonfirmasi. Token GET/HEAD non-consuming, CSRF, OAuth dan challenge asal tetap dipertahankan. API/proxy hanya menyajikan enam aset yang disebut eksplisit; tidak membuka direktori workspace.

Typecheck, lint, format, build, 121 unit dan 28 E2E lulus. Browser Edge Chromium diperiksa pada lebar 360/390/768/1440, tanpa overflow horizontal atau error JS. Skenario sintetis mencakup izin AI, Picker, sheet ID nol, error validasi dan retry, ringkasan konfirmasi, pembatalan dan kedaluwarsa. Tidak menjalankan login Google nyata, mengirim chat nyata, atau menulis tracker untuk pemeriksaan UI ini.

Deployment aktif pada release VPS `20261018T140106Z`; release sebelumnya disimpan untuk rollback. Build server dan verifikasi patch WhatsApp/aset lulus. API/worker/proxy/gateway/Caddy aktif; API/gateway ready, NRestarts API/worker/gateway nol. Gateway tidak direstart. Probe HTTPS menunjukkan GET/HEAD tautan sintetis 200 tanpa cookie, seluruh gambar/font/CSS 200, recovery sesi 401 HTML, POST tanpa sesi 401 dan internal/aset asing 404. Render browser melalui domain utama membuktikan font dan kedua gambar termuat, tanpa HTTP gagal/error JS/overflow. Tidak ada perubahan env, credential atau database.

## Auto-config tracker adaptif, 18 Oktober

[ADR 0006](adr/0006-adaptive-tracker-configuration.md) menerapkan permintaan membaca struktur terlebih dahulu dengan template pemilik sebagai acuan. Adapter mempertahankan jalur/fingerprint lama, lalu menemukan variasi kolom label, urutan aktivitas, dan header tanggal yang tidak ambigu. Aturan perbandingan angka, dropdown angka literal/rentang/named range, dan formula validasi sederhana pada sel yang sama didukung. Checkbox khusus, aturan arbitrer dan pemetaan ambigu tetap ditolak dengan aktivitas, alamat sel dan tipe aturan. Domain 15 aktivitas tetap sama. Konfigurasi tidak mengubah isi/aturan sheet dan tidak mengirim data sheet ke AI.

Ringkasan jumlah aktivitas dan rentang tanggal tampil pada browser serta DM sebelum aktivasi challenge asal. Binding menyimpan baris dan hash label aktual; tidak ada migrasi, env atau credential baru. Perubahan struktur setelah aktivasi tetap membutuhkan validasi ulang. Pemeriksaan onboarding memakai satu tanggal contoh; target aktual diperiksa ulang sebelum setiap penulisan.

Typecheck, lint, format, build, 120 unit dan 28 E2E lulus. Satu integration OAuth terpilih pada Supabase utama lulus, mencakup ringkasan konfigurasi, 15 binding tersimpan, state/CSRF dan konfirmasi DM; 16 integration lain tidak diulang. Fixture sintetis dibersihkan dan worker diaktifkan kembali. Pemeriksaan read-only tracker acuan nyata dari VPS mengenali 15 aktivitas, 701 tanggal, dan fingerprint yang identik dengan koneksi aktif, memakai empat GET Google tanpa write Sheets. File teman yang semula ditolak belum tersedia; penyebab aturan persis file tersebut dan keberhasilan onboarding ulangnya belum terbukti.

Release VPS aktif `20261018T134307Z`. Build server dan verifikasi patch WhatsApp lulus. API, worker, proxy, gateway dan Caddy aktif; API/gateway ready dan NRestarts API/worker/gateway nol. Gateway tidak direstart sehingga sesi WhatsApp dipertahankan. Release sebelumnya tersedia untuk rollback. Probe HTTPS memeriksa halaman onboarding non-consuming, entry script, Origin asing, token sintetis tidak dikenal, recovery sesi, dan internal publik tersembunyi. Tidak menulis tracker peserta atau mengirim chat nyata untuk pengujian ini.

## Tautan onboarding pada browser peserta, 18 Oktober

Laporan halaman ONBOARDING_EXPIRED menunjukkan masalah token/sesi aplikasi sebelum login Google. Metadata terbatas peserta yang diperiksa memperlihatkan tiga sesi berdekatan: dua cancelled oleh permintaan daftar berikutnya, satu browser_bound tanpa koneksi Google. Metadata tersebut tidak membuktikan browser atau pratinjau mana yang memakai tautan. GET lama memang langsung melakukan exchange, sehingga pratinjau/prefetch dan pembukaan ulang dapat menghabiskan token terlalu dini.

[ADR 0005](adr/0005-browser-onboarding-links.md) mengubah GET/HEAD menjadi halaman awal tanpa konsumsi token. POST exchange hanya berjalan setelah klik Lanjutkan, dengan pemeriksaan Origin/custom header. Resume mensyaratkan cookie browser asli dan token tautan yang sama; OAuth state dan TTL tidak diperpanjang. Tautan sesi lain, cookie salah, sesi selesai, dan CSRF lama tetap ditolak. Halaman browser kedaluwarsa memberi panduan meminta tautan terakhir, sementara API tetap JSON. Balasan daftar menjelaskan pemakaian Chrome/Safari, tombol Lanjutkan, dan tautan sebelumnya dibatalkan.

Typecheck, lint, format, build, 96 unit dan 28 E2E lulus. Satu integration OAuth terpilih pada Supabase utama lulus untuk resume sebelum/selama OAuth, isolasi dua peserta, CSRF/state sekali pakai, dan challenge DM; 16 integration lain tidak diulang. Worker VPS dihentikan selama fixture tersebut, data sintetis dibersihkan, lalu worker diaktifkan kembali. Tidak memakai database terpisah, tidak mengubah schema/env/credential, dan tidak menulis tracker pribadi.

Deployment aktif pada release VPS `20261018T123621Z`, dengan release sebelumnya tetap tersedia untuk rollback. API/worker/proxy dimuat ulang; gateway WhatsApp mempertahankan sesi dan NRestarts=0. Probe HTTPS membuktikan GET berulang dan HEAD tautan 200 tanpa Set-Cookie, entry script 200, Origin asing 403, token sintetis tidak dikenal 401 melalui POST dengan Origin publik yang diteruskan proxy, recovery halaman 401 HTML, dan internal publik 404. API serta gateway ready. Probe memakai token sintetis dan tidak mengonsumsi tautan peserta. Login nyata peserta sesudah perubahan ini masih perlu pesan daftar baru dan klik Lanjutkan pada tautan terakhir.

## Pesan pertama WhatsApp tidak sampai ke backend, 18 Oktober

Pemeriksaan khusus peserta yang dilaporkan menunjukkan satu event kanal pada 19.05.34 WIB selesai dalam 27 ms tanpa event backend. Tiga pesan peserta tersebut pada 19.12 berbeda dan berhasil sampai ke backend/outbox. Pemetaan identitas forward/reverse sudah dibuat sesaat sebelum event pertama; tidak ada bukti yang cukup untuk menyimpulkan kegagalan pemetaan adalah penyebab pesan lama. Payload event selesai telah dibersihkan sehingga alasan persis pengabaian tidak dapat dipastikan dari data tersisa.

Kode OpenClaw/WhatsApp 2026.10.3 dan Baileys 7.0.0-rc14 memperlihatkan celah yang dapat direproduksi: placeholder tanpa isi memakai key pesan asli, diakui antrean sebagai completed karena normalisasi null, kemudian isi hasil dekripsi dengan key yang sama diabaikan sebagai duplikat. Patch versi terikat kini menyaring envelope tanpa konten sebelum reservasi key antrean. Identitas yang belum terpetakan menghasilkan error retryable pada antrean native, bukan completed; identitas tetap hanya berasal dari resolver metadata kanal. Kebijakan grup/outbound tetap diperiksa native. Log diagnostik hanya memuat kode dan hash key event, tanpa nomor/isi chat. Patch diperiksa berdasarkan versi, SHA256 sumber asli, dan seluruh anchor; startup production memverifikasinya secara read-only. Installer memasangnya setelah dependency gateway terpasang.

Uji menggunakan potongan adapter upstream yang sama mereproduksi kehilangan pesan pada versi lama, menerima dekripsi ulang satu kali sesudah patch, mempertahankan deduplikasi, retry resolusi identitas, serta penolakan grup/outbound. Typecheck, lint, format check, 92 unit dan 28 E2E lulus. CLI pemasangan/validasi patch dan syntax check pada dependency lokal juga lulus. Tidak mengubah database/schema, credential, atau tracker peserta. Pesan lama tidak direplay karena payload aslinya tidak tersedia.

Patch dipasang pada release VPS `20261018T122504Z` dengan salinan release/dependency sebelumnya untuk rollback. Gateway memverifikasi patch dan bridge sebelum startup; status native WhatsApp linked/running/connected true, API/gateway ready, NRestarts=0, homepage publik 200 dan route internal publik 404. Setelah restart, pemilik mengonfirmasi peserta yang semula tidak mendapat balasan kini menerima tautan dari pesan “daftar” baru. Ini membuktikan jalur onboarding peserta tersebut kembali berjalan; alasan pasti pengabaian event lama tetap tidak dapat direkonstruksi.

## Akses Google peserta lain berhasil, 18 Oktober

Setelah pengisian Branding, pembukaan tombol Publish app, dan penjelasan bahwa pesan Branding belum ditampilkan terpisah dari verifikasi Data access yang tidak diperlukan, pemilik mengonfirmasi “sudah berhasil” pada instruksi mencoba login dengan akun peserta lain. Tahap akses Google peserta lain dicatat berhasil berdasarkan konfirmasi pemilik. Status Console tidak diperiksa langsung oleh agent. Langkah validasi berikutnya adalah dua peserta menggunakan tracker masing-masing untuk pencatatan/rekap serta koreksi/undo tanpa data tertukar; hasil login ini belum menjadi bukti semua skenario tersebut. Catatan belum dikonfirmasi di checkpoint lama di bawah merupakan riwayat sebelum hasil ini.

## Domain dan HTTPS aktif, 18 Oktober

Pemeriksaan terbaru Google DNS dan Cloudflare memberi A app.sdj-rumah-kepemimpinan.my.id → 38.9.46.213. HTTPS diperiksa dengan verifikasi sertifikat normal: GET /, /privacy, /terms menghasilkan HTML 200; /health/ready dan /internal/v1/channel-events melalui domain publik menghasilkan 404. API, worker, gateway dan Caddy tetap aktif; database ready, gateway NRestarts=0 pada pemeriksaan. Blokir DNS/HTTPS pada checkpoint di bawah telah teratasi. PUBLIC_BASE_URL pada .env lokal utama diselaraskan ke domain app; environment VPS sudah memakai alamat tersebut.

Pengguna telah mengonfirmasi origin, callback dan restriction Picker ditambahkan di Google Console. Login/Picker/aktivasi nyata pada domain VPS, akses akun kedua dan status Audience/Branding terbaru belum terbukti. Gate berikutnya: uji dua peserta dan ketahanan kanal, evaluasi AI penuh dan beban, backup off-server/restore, audit retensi OpenClaw, revokasi token Google otomatis serta penanganan needs_review. Jangan menganggap hasil HTTP 200 sebagai kelulusan onboarding lengkap.

Pembaruan akses peserta: pemilik kemudian mengonfirmasi penghubungan tracker ulang sudah works. Pada pengecekan Audience, pemilik melaporkan Testing dengan Publish app terkunci. Homepage/privasi/ketentuan diperiksa ulang HTTPS 200; Client ID cocok dengan project number dan konfigurasi utama lengkap. Setelah mengikuti pengisian Branding dengan tiga URL domain app, Authorized domains root, serta email dukungan/kontak, pemilik mengonfirmasi Publish app sekarang bisa diklik. Pesan lanjutan Google ternyata menyatakan Branding belum ditampilkan dan Data access verification tidak diperlukan karena tidak meminta sensitive/restricted scopes. Ini bukan bukti publikasi/login umum ditolak; tahap berikutnya memeriksa Audience External/In production dan login peserta kedua. Kedua hasil belum dikonfirmasi. Alat browser kembali melaporkan Local browser use is disabled in Work settings; tidak ada perubahan Google Console yang dilakukan oleh agent. Panduan Google/public-access diperbarui dari ngrok ke deployment VPS, termasuk perbedaan status Branding dan izin data serta uji peserta kedua.

## Pemulihan bridge setelah migrasi Linux, 18 Oktober

Pengguna melaporkan balasan native OpenClaw “Couldn't sign in to the AI service”. Diagnosis runtime menemukan direktori bridge hasil tar Windows bermode 777, sehingga loader memblokir kandidat. Status kanal connected sebelumnya tidak membuktikan bridge produk aktif. Izin release VPS diperbaiki dengan menghapus group/other write; proses ekspor/aktivasi kini menormalisasi permission dan ekstraksi memakai no-same-permissions/no-same-owner.

Bridge eksternal juga memerlukan hooks.allowConversationAccess=true pada OpenClaw yang dipin. Launcher memigrasikan grant ini secara eksplisit hanya pada sdj-bridge, dengan allowPromptInjection=false. Snapshot konfigurasi lokal utama diperbarui tanpa menjalankan gateway lokal. Launcher memeriksa `plugins inspect sdj-bridge --runtime --json` sebelum gateway run dan berhenti jika plugin, typed hook before_dispatch, service sdj-outbox, atau grant pesan tidak aktif. `plugins list` hanya metadata dan tidak dipakai sebagai bukti registrasi hook.

Pemeriksaan native di VPS membuktikan plugin loaded, before_dispatch priority 1000, sdj-outbox terdaftar, grant benar, dan diagnostics kosong. Typecheck/lint/format, 88 unit dan 28 E2E lulus. Gateway kembali ready dan WhatsApp linked/running/connected true setelah restart. Pengguna mengirim pesan baru “bantuan” dan mengonfirmasi panduan SDJ muncul: alur kanal → bridge → backend → outbox → WhatsApp berhasil. Tidak menambahkan credential AI ke OpenClaw; interpretasi tetap melalui backend SDJ. Uji ini tidak menulis tracker dan tidak membuktikan onboarding domain baru; DNS/HTTPS tetap gate terpisah.

## Deployment VPS Jagoan Hosting, 18 Oktober

VPS `38.9.46.213` Rocky Linux 8.10 x86_64 telah dapat diakses memakai key deployment. Node 24.16.0, pnpm 12.11.2, OpenClaw/WhatsApp 2026.10.3 dipasang. API, satu worker, proxy publik, gateway, Caddy, dan timer maintenance terdaftar otomatis melalui systemd dengan user terbatas. Environment runtime terpilih disalin dari `.env` utama; credential migrator/owner/ngrok tidak disalin ke layanan. Supabase tetap memakai role dan key utama. API readiness dari VPS berhasil.

Sesi WhatsApp dipindahkan setelah memastikan gateway lokal tidak berjalan; restart gateway VPS tetap menghasilkan linked/running/connected true. Launcher kini mendukung Linux dan remap absolute plugin path. Batas heap/memori serta swap diatur untuk VPS 2 GB. Endpoint API/gateway/admin tetap loopback; proxy menolak internal dengan 404. HTTP dari internet mencapai Caddy dan mengarahkan ke HTTPS.

Belum selesai: DNS `app.sdj-rumah-kepemimpinan.my.id` masih SERVFAIL/REFUSED meskipun pengguna menyatakan A app → 38.9.46.213 sudah disimpan pada nameserver IDwebhost. Sertifikat HTTPS dan onboarding Google dari domain baru belum terverifikasi. Pengguna telah mengonfirmasi origin/callback/Picker di Console sudah ditambahkan; belum ada bukti login nyata pada domain VPS. Backup terjadwal off-server/restore juga belum diuji. Jangan mengklaim deployment publik atau kesiapan pilot lengkap.

Typecheck/lint/build/format, 86 unit dan 28 E2E lulus untuk perubahan launcher/proxy/export. Tidak menjalankan fixture integration pada worker aktif dan tidak menulis tracker peserta. [Runbook VPS](runbooks/vps-deployment.md) mencatat layanan, DNS/Google yang tersisa, restart, secret terpisah, dan backup. Checkpoint Diskon di bawah adalah riwayat sebelum VPS tersedia.

## Persiapan domain Diskon.com, 18 Oktober (riwayat)

Pengguna memberikan domain `sdj-rumah-kepemimpinan.my.id` dan screenshot CWP hosting gratis. Panel memperlihatkan Apache/PHP/MySQL; dukungan Node.js dan proses berkelanjutan belum terbukti. Dokumentasi resmi penyedia menempatkan paket dengan spesifikasi serupa sebagai hosting PHP/statis. Rancangan yang disiapkan adalah root domain untuk website publik dan subdomain app untuk backend Node.js yang akan ditentukan; tidak ada perubahan DNS atau environment aktif.

Probe DNS eksternal Google/Cloudflare belum berhasil (SERVFAIL/NXDOMAIN, No Reachable Authority/REFUSED). HTTP dan HTTPS domain belum dapat diperiksa. Ini memerlukan pemeriksaan aktivasi, zone, dan delegasi pada penyedia. Inventory alat browser melaporkan akses browser lokal dinonaktifkan, sehingga panel tidak dapat dioperasikan dan tidak ada upload/AutoSSL/perubahan Google yang dilakukan.

`pnpm export:shared-hosting` mengekspor tiga halaman publik dan `.htaccess` ke direktori build baru tanpa membaca `.env`. Paket `.local/deployment/sdj-public-website.zip` dibuat dan daftar isinya diverifikasi persis empat file publik, ukuran 6.292 bytes. Typecheck, lint, format check, dan sembilan unit test API/proxy terkait lulus. [Runbook deployment](runbooks/diskon-deployment.md) memuat pemeriksaan panel, DNS, upload, AutoSSL, pemisahan backend, dan langkah Google setelah layanan siap. Paket ini hanya website informasi; deployment aplikasi lengkap masih menunggu akses panel, DNS aktif, dan runtime backend yang sesuai.

## Halaman Branding Google, 17 Oktober

Tangkapan layar Audience mengonfirmasi status Testing, satu Test user, dan Publish app yang dinonaktifkan karena Branding belum lengkap. Tangkapan layar Branding menunjukkan nama/email bantuan telah terisi dan tiga URL App domain masih kosong. API kini menyediakan homepage HTML yang menjelaskan fungsi aplikasi, `/privacy` dan `/terms`, tanpa memerlukan sesi atau memasang cookie. Halaman penghubungan menautkan kebijakan tersebut. Isi privasi mengikuti akses file pilihan melalui drive.file, consent AI, penyedia backend, retensi, dan penghapusan yang tersedia pada implementasi.

Proxy hanya menambah allowlist GET untuk tiga halaman publik tersebut; endpoint internal tetap tertutup. Typecheck, lint, build, format check, 86 unit dan 28 E2E lulus. API/worker dan tunnel utama dimuat ulang; probe internet untuk homepage/privasi/ketentuan mengembalikan HTML 200 tanpa cookie, status sesi tanpa login 401, internal/health publik 404. Inspeksi ngrok tetap nonaktif. Integration database tidak diulang karena tidak ada perubahan SQL/schema.

Pemilik masih perlu mengisi tiga URL dan menyelesaikan validasi Branding pada Google Cloud, kemudian melanjutkan Audience/Publish app jika tersedia. Halaman publik bukan bukti kepemilikan domain atau kelulusan verifikasi Google; domain dev ngrok tidak otomatis memenuhi persyaratan domain terverifikasi. Jalur Test users tetap tersedia untuk akun teman selama prasyarat publikasi belum terpenuhi. [Runbook](runbooks/public-access.md#publish-app-terkunci-karena-branding-belum-lengkap) memuat URL dan langkah yang sesuai.

## Domain publik ngrok, 17 Oktober

Laporan lanjutan: pemilik menyatakan login pada HP sendiri berhasil, tetapi akun teman melihat “Access blocked” dari Google. Kode error rinci belum tersedia; status audience Console belum dapat diverifikasi. API utama dan domain publik diperiksa ulang merespons 200. Kode hanya meminta openid/drive.file dan tidak membatasi daftar akun Google peserta. Runbook kini memisahkan langkah External/In production untuk peserta umum dari Test users untuk akses terbatas, serta diagnosis browser, callback, dan kebijakan Workspace. Percobaan kontrol browser gagal sebelum membuka Console (`failed to write kernel assets`); tidak ada perubahan audience Google Cloud atau klaim login teman sudah berhasil.

Ngrok 3.39.11 dipasang di `.local/ngrok/`. Authtoken pengguna disimpan ke `.env` utama dan `PUBLIC_BASE_URL` diperbarui menjadi `https://kosher-calorie-unmixable.ngrok-free.dev`. API/worker utama dimuat ulang. `pnpm share` menjalankan proxy onboarding loopback port 3001 dan ngrok dengan inspeksi request dinonaktifkan. Launcher gateway kini secara eksplisit memakai API loopback; sesi WhatsApp yang berjalan dipertahankan.

Probe internet membuktikan domain utama 200, client onboarding 200, status sesi tanpa cookie 401, serta `/internal/v1/channel-events` dan `/health/ready` publik 404. Agent API mengonfirmasi upstream loopback 3001 dan `inspect=false`. Test proxy memeriksa query OAuth/cookie/CSRF tetap utuh serta penolakan traversal path dan metode di luar allowlist. Typecheck, lint, build, format check, 85 unit dan 28 E2E lulus; integration database tidak diulang karena tidak ada perubahan SQL/schema.

Origin/redirect OAuth dan website restriction key Picker pada Google Cloud belum diubah atau dibuktikan dari sini. Pemilik perlu menambahkan domain persis sesuai [runbook akses publik](runbooks/public-access.md) sebelum login Google dari perangkat lain. Pengujian login/Picker/aktivasi nyata melalui domain publik masih belum selesai. Domain dapat dijangkau selama komputer, backend, gateway, dan tunnel aktif.

## DM peserta tanpa pairing code, 17 Oktober

Verifikasi setelah startup: API `ready`; gateway WhatsApp melaporkan `linked=true`, `running=true`, `connected=true`, `lastError=null`, tanpa status issue. API, worker, pemeliharaan dan gateway utama dibiarkan berjalan. Startup OpenClaw pada Windows kali ini memerlukan beberapa menit untuk memuat modul sebelum koneksi aktif.

[ADR 0005](adr/0005-public-whatsapp-dm.md) membuka DM dari semua nomor atas permintaan pemilik proyek. Kanal dan akun utama memakai `dmPolicy: open` serta `allowFrom: ["*"]`. Launcher memigrasikan konfigurasi yang sudah ada dan menerapkannya secara idempoten setiap dijalankan. Grup tetap disabled, sesi tetap terpisah per pengirim, dan perintah native gateway melalui WhatsApp ditutup melalui command allowlist kosong. QR sesi ponsel bot berbeda dari pairing code peserta dan tidak dihapus.

Login Google, pemilihan tracker dan konfirmasi DM asal tetap menjadi batas akses data. Tes baru membuktikan nomor yang belum aktif dapat meminta tautan pendaftaran tetapi tidak dapat menulis tracker. Tidak ada perubahan SQL/RLS, consent AI massal, credential, atau owner.

Pemeriksaan terbaru untuk perubahan ini: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, 84 unit dan 28 E2E lulus. OpenClaw 2026.10.3 `config validate` menerima konfigurasi utama; snapshot metadata mengonfirmasi mode open dan wildcard pada kanal/akun. API/worker dijalankan memakai `.env` utama dan `/health/ready` memberi `ready`; gateway dijalankan dengan sesi tersimpan. Tujuh belas integration pada database utama adalah bukti checkpoint sebelumnya, tidak diulang untuk perubahan konfigurasi kanal ini. Uji live dengan nomor baru yang belum pernah disetujui masih perlu pesan nyata peserta. Origin login tetap localhost; login dibuka dari komputer aplikasi sampai URL publik dikonfigurasi secara terpisah.

## Perbaikan respons AI dan konteks rekap, 16 Oktober

Rekap bulanan nyata sudah diterima peserta menurut tangkapan layar. Metadata percobaan peserta pengujian mengonfirmasi izin AI aktif, diikuti timeout NVIDIA serta output invalid dari Groq/Gemini. Probe sintetis mereproduksi output skor lengkap dengan tanggal per item null walaupun pesan menyebut hari ini. Instruksi prompt kini memisahkan tanggal tingkat atas dari tanggal per item. Output dengan slot kosong menjadi klarifikasi, tanpa menebak tanggal atau mengklaim layanan mati.

[ADR 0004](adr/0004-conversational-reliability.md) menambahkan awalan pencatatan lokal dan `format_summary`. Kalimat pengisian lima salat dari laporan serta permintaan merapikan ringkasan diuji berjalan ketika interpreter sengaja dibuat gagal. Jenis/periode rekap disimpan terenkripsi per identity selama konteks 30 menit, dan data dibaca ulang ketika dirapikan. Rekap versi sebelumnya masih dapat ditemukan dari header balasan terenkripsi milik identity tersebut; probe metadata pada peserta pengujian mengonfirmasi konteks lama tersedia tanpa menampilkan isian. Ringkasan memakai bagian dan bullet WhatsApp. Checkbox dihitung sebagai centang, bukan dianggap bukti pelaporan semua hari.

Pemeriksaan terbaru: 83 unit + 27 E2E + 17 integration pada Supabase utama = 127 pengujian lulus; typecheck, lint, build dan format check lulus. Integration tambahan membuktikan persistensi konteks terenkripsi, isolasi identity/peserta, TTL, serta kompatibilitas rekap lama. Probe router utama dengan reservation PostgreSQL dan pesan sintetis lulus sekitar 3,32 detik tanpa menulis tracker. API/worker dimuat ulang setelah integration dan gateway dijalankan kembali. Tidak ada perubahan kuota/biaya, role, schema, atau replay otomatis atas pesan lama yang ditolak.

Layanan bahasa bebas di luar jalur lokal tetap mengikuti ketersediaan provider dan batas konservatif yang sudah ada. Pesan masa jeda kini dibedakan dari percobaan provider yang gagal; keduanya tidak meminta penghubungan atau consent ulang. Bukti di bawah mempertahankan checkpoint sebelumnya.

## Perbaikan izin AI dan progres bulanan, 16 Oktober

Laporan peserta menunjukkan login/aktivasi tracker serta pencatatan `subuh, 3` sudah berhasil, tetapi instruksi bebas mendapat pesan menghubungkan tracker kembali. Penyebab pada kode adalah gate `ai_processing_allowed=false` yang memakai pesan onboarding meskipun tracker aktif. Izin AI terpisah dari koneksi Google; checkbox juga tidak dipulihkan secara visual setelah redirect OAuth, dan perubahan checkbox sesudah OAuth sebelumnya tidak disimpan saat memilih tracker.

[ADR 0003](adr/0003-ai-consent-and-monthly-progress.md) mengubah alur menjadi persetujuan lewat DM untuk peserta yang sudah terhubung, lalu melanjutkan instruksi awal tanpa login ulang. Izin disimpan per user dengan pemeriksaan actor/lease; pending tetap terikat identity dan terenkripsi. Penolakan/expiry tidak memutus tracker. Retry setelah izin tersimpan diuji agar instruksi awal tidak hilang atau ditulis berulang. Browser memulihkan pilihan sesi setelah OAuth dan menyimpan pilihan terkini saat aktivasi. Status/aktivasi menampilkan izin AI secara terpisah.

Intent baca `monthly_summary` ditambahkan untuk progres bulanan. Total, rata-rata skor, hari dilakukan, dan keterisian dihitung backend dari tracker. Blank/0/false tetap berbeda dan hari mendatang tidak dihitung. Read banyak sel menggunakan range ringkas; semua tanggal periode wajib tersedia agar laporan tidak diam-diam parsial. Tidak ada perubahan schema atau migrasi.

Pemeriksaan terbaru: 77 unit + 24 E2E + 16 integration pada Supabase utama = 117 pengujian lulus. `pnpm typecheck`, `pnpm lint`, `pnpm build`, dan `pnpm format:check` lulus. Integration menguji persistensi izin, penolakan actor palsu, isolasi peserta, serta perubahan pilihan AI dari false pada OAuth menjadi true saat pemilihan tracker. API/worker utama dimuat ulang dan gateway WhatsApp dijalankan kembali setelah integration selesai.

Dataset percakapan kini versi `sdj-conversation-v3` dengan 17 kasus. Dua frasa pada laporan pengguna diuji live: Groq 2/2 (1,14–1,17 detik), Gemini 2/2 (2,40–3,82 detik), seluruhnya dipetakan ke rekap bulanan. Report ada di `.local/evaluation/sdj-conversation-v3-{groq,gemini}.json`. Ini bukan kelulusan seluruh dataset. Uji peserta berikutnya: kirim instruksi bebas, setujui penjelasan AI sekali bila belum aktif, lalu periksa balasan progres; tidak perlu mengulang penghubungan Google.

Bagian berikut mempertahankan bukti checkpoint sebelumnya. Gate login/pencatatan dasar pada bagian lama telah mendapat bukti pengguna melalui tangkapan layar terbaru; rekap bulanan nyata dan flow izin baru melalui WhatsApp masih memerlukan balasan peserta.

## Pembaruan percakapan bahasa sehari-hari

Permintaan pengguna agar tidak terikat format khusus diimplementasikan melalui [ADR 0002](adr/0002-natural-language-conversation.md). Interpreter sekarang mencakup seluruh jenis tindakan SDJ, angka dalam kata, tanggal relatif, serta jawaban lanjutan terhadap pertanyaan aktif identity yang sama. Klarifikasi beberapa item menanyakan slot yang kurang dan menahan seluruh batch sampai lengkap. Konfirmasi putus koneksi/penghapusan tetap diperiksa backend. Sapaan dan percakapan awal penghubungan tertentu dapat berjalan sebelum consent tanpa panggilan AI.

Pemeriksaan terbaru untuk perubahan ini: `pnpm typecheck`, `pnpm lint`, `pnpm build`, 74 unit test dan 19 E2E lulus. Lima belas integration test Supabase utama adalah hasil checkpoint sebelumnya; tidak diulang karena perubahan ini tidak mengubah SQL/schema/adapter database. API dan worker utama sudah direstart dengan kode baru, gateway WhatsApp tetap berjalan.

Dataset baru `sdj-conversation-v2` memiliki 15 kasus. Smoke sebelum penyempurnaan prompt: Groq 3/4 dan Gemini 1/3, termasuk kegagalan interpretasi jawaban lanjutan serta timeout. Setelah perbaikan prompt, probe jawaban lanjutan tunggal lulus pada Groq dan Gemini; probe gabungan baru dengan slot yang sudah diketahui lulus pada Groq (1,36 detik), Gemini timeout pada empat detik. Report sintetis probe gabungan tersimpan di `.local/evaluation/final-conversation-smoke.json`. Ini bukti parsial, bukan kelulusan seluruh dataset atau klaim memahami setiap kalimat. Evaluasi provider lengkap tetap gate terbuka.

## Yang telah dibuktikan

- Core 15 aktivitas, parser/alias, set absolut maksimal lima item, tanggal penerimaan sesuai timezone, klarifikasi, rekap, dan undo seluruh kelompok dengan TTL 10 menit.
- PostgreSQL Supabase utama dengan schema privat `sdj`, FORCE RLS, composite FK ownership, nonowner/non-BYPASS runtime, role ingress/scheduler/maintenance terpisah, journal, queue lease, advisory lock, outbox, nonce/HMAC, dan deduplikasi.
- Readback sebelum sukses, recovery prepared/uncertain, barrier unresolved, conflict terhadap edit manual/struktur, dan needs_review setelah 15 menit tanpa replay write.
- Google OAuth PKCE/state sekali pakai, browser session/CSRF, challenge DM, token terenkripsi, Picker, pemilihan tab, validasi native/edit/label/header, typed UpdateCells, formula/protection checks. Kredensial terbaru diimpor ke `.env` utama dari file pengguna; origin/redirect cocok dan endpoint Google menerima client tersebut. Consent pengguna dan write nyata belum dibuktikan.
- Router AI Groq → Gemini → NVIDIA dengan cursor/reservation/cooldown persisten, maksimal tiga call dan deadline, schema serta semantic validation. Registry target utama dikonfigurasi dengan batas lokal 1 request/menit dan 50/hari, credential tetap di environment.
- Retensi teks terminal tujuh hari, payload journal/outbox tiga puluh hari, account deletion dengan tombstone, serta penahanan unresolved. Command pemeliharaan global sukses; launcher menjalankannya pada startup dan setiap jam.
- OpenClaw dipasangkan menggunakan QR terminal. Gateway melaporkan WhatsApp linked/running/connected tanpa lastError. Kode pairing peserta pengujian disetujui. Satu pesan `daftar` nyata berhasil masuk ke backend dan onboarding/outbox terbentuk.

## Temuan live yang diperbaiki

Context `before_dispatch.conversationId` OpenClaw 2026.10.3 dapat berisi recipient bot. Balasan awal diakui platform tetapi tidak sampai ke peserta. Bridge kini menggunakan `senderId` tepercaya sebagai tujuan DM dan memiliki regression test dua pengirim. Setelah restart, pengguna mengonfirmasi tautan onboarding sudah diterima melalui WhatsApp.

Login Google nyata pertama kembali dengan parameter `iss=https://accounts.google.com` yang belum diterima validator strict. Validator kini menerima issuer resmi tersebut dan menolak issuer lain; regression test callback mencakup keduanya. Backend sudah direstart. Login ulang dengan tautan baru masih menunggu konfirmasi pengguna.

Picker memerlukan origin pada referrer untuk API-key restrictions; kebijakan diubah menjadi `strict-origin` agar hanya origin dikirim, tanpa path/token onboarding. Respons tetap no-store dan CSP membatasi halaman koneksi.

## Pemeriksaan yang dijalankan

Pada checkpoint sebelum dua regression test terakhir: 53 unit + 11 E2E + 15 integration = 79 pengujian lulus. Setelah perbaikan route DM, 54 unit lulus; pemeriksaan terakhir dicatat di bawah setelah eksekusi. Integration memakai Supabase utama dan peserta sintetis, bukan database test terpisah. Sheets/provider pada integration tetap sintetis agar pengujian tidak menulis tracker pribadi.

Pemeriksaan terakhir: 56 unit test lulus setelah perbaikan callback issuer, 11 E2E lulus, dan 15 integration pada Supabase utama lulus pada eksekusi terakhir (82 total). `pnpm typecheck`, `pnpm lint`, `pnpm build`, dan `pnpm format:check` telah lulus setelah perubahan terakhir. `pnpm maintenance` sukses dengan nol kandidat setelah cleanup. Supabase security advisor tidak memberi peringatan pada pemeriksaan terakhir setelah migration ketujuh. `.env`, state WhatsApp, dan `.local/` terkonfirmasi diabaikan Git. `.env.example` sudah diganti placeholder.

## Evaluasi AI nyata

Dataset `sdj-intent-v1` berisi 100 kasus sintetis per provider. Harness mendukung opt-in, batas lokal, report, dan resume; laporan berada di `.local/evaluation/`.

- Groq: 3/3 smoke case lulus, sekitar 1,0–1,2 detik.
- Gemini: 2/3 smoke case lulus (sekitar 1,6–2,4 detik); satu timeout pada deadline runtime 4 detik. Probe awal terpisah benar sekitar 3,6 detik.
- NVIDIA GLM: 0/3 smoke case selesai pada deadline 4 detik; probe awal 10 detik juga timeout.

Evaluasi 100 kasus/provider belum selesai. Tiga provider tidak boleh diklaim sama andalnya atau lolos kualitas/latensi berdasarkan smoke test. Router tetap fallback dan parser tersedia bila seluruh provider gagal. Tidak ada fallback berbayar.

## Versi dan lokasi

Node backend tersedia 24.14.1; launcher memilih Node 24.16.0 pada `.local/runtime` agar kompatibel dengan OpenClaw. OpenClaw dan plugin WhatsApp dipin 2026.10.3. TypeScript 5.9.3, Fastify 5.12.7, pg 8.23.1, Zod 3.25.76, Vitest 2.1.9, pnpm 12.11.2. Runtime memakai `.env` utama dan session pooler port 5432 dengan CA verification.

Migration aktif ada di `supabase/migrations` dan versinya disamakan dengan history Supabase. File konfigurasi password runtime pada history hanya dijelaskan dengan komentar di repo; verifier/password asli tidak disimpan Git. Deployment baru perlu provisioning role terpisah oleh administrator.

## Gate yang masih terbuka

1. Login Google/Picker nyata setelah perbaikan callback issuer, challenge DM dan write/readback tracker yang memang diminta peserta. Balasan tautan WhatsApp sudah dikonfirmasi diterima.
2. G0 lengkap dua identitas, reconnect/history/echo/grup dan audit retensi transkrip SQLite OpenClaw.
3. Evaluasi 100 kasus/provider, termasuk latensi NVIDIA/Gemini pada deadline empat detik.
4. Restore backup lengkap beserta replay tombstone dan pemeriksaan unresolved. Runbook sudah tersedia; restore belum dilakukan.
5. Revokasi Google melalui provider saat disconnect dan UI operator untuk needs_review belum tersedia; token lokal dihapus dan akses dapat dicabut pengguna di akun Google.

Proyek belum dinyatakan siap pilot penuh. [Runbook operasional](runbooks/operations.md) dan [tutorial Google tombol per tombol](runbooks/google-oauth.md) tersedia. Prototipe lama diarsipkan lokal ke `legacy/`, bukan dihapus tanpa salinan. Tidak ada commit atau push otomatis.

Heartbeat/cron bawaan OpenClaw dinonaktifkan pada instance SDJ setelah ditemukan percobaan heartbeat default menuju provider OpenAI yang tidak dikonfigurasi. Interpretasi pesan SDJ tetap hanya melalui router backend. Tidak ada credential OpenAI atau fallback berbayar yang ditambahkan.
