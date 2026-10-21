# SDJ Assistant

Pencatatan 15 aktivitas SDJ melalui DM WhatsApp ke Google Sheets pribadi. Backend TypeScript memakai Supabase PostgreSQL utama, parser deterministik, router AI Groq/Gemini/OpenRouter/NVIDIA, journal, readback, dan undo seluruh kelompok.

## Menjalankan di environment utama

Backend utama kini terpasang di VPS Jagoan Hosting menggunakan systemd; sesi WhatsApp telah tersambung. Domain https://app.sdj-rumah-kepemimpinan.my.id sudah aktif melalui HTTPS. Pengaturan URL Google dikonfirmasi telah ditambahkan; login/Picker/aktivasi nyata pada domain ini masih perlu diuji. Ikuti [runbook VPS](docs/runbooks/vps-deployment.md) untuk status serta operasional. Jangan menjalankan gateway lokal dengan sesi yang sama selama gateway VPS aktif. Perintah lokal berikut untuk pengembangan, bukan cara menyalakan deployment VPS.

Semua proses membaca `.env` pada folder proyek ini. Konfigurasi database dan Google yang diberikan sudah dimasukkan ke file tersebut. Tidak ada database test terpisah.

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm setup:runtime
pnpm dev
```

API: `http://localhost:3000`. Pemeriksaan koneksi database: `http://localhost:3000/health/ready`. Worker dipakai bersama API oleh `pnpm dev`; jangan menjalankan worker kedua tanpa kebutuhan.

Akses deployment dari perangkat lain memakai `https://app.sdj-rumah-kepemimpinan.my.id`. VPS menjalankan aplikasi secara mandiri; komputer lokal dan ngrok tidak diperlukan. Panduan ngrok lama tetap tersedia sebagai riwayat pengembangan pada [akses publik](docs/runbooks/public-access.md).

Pairing WhatsApp, pada terminal lain saat gateway belum berjalan:

```powershell
pnpm whatsapp:pair
```

Pindai QR langsung pada terminal. Setelah berhasil, jalankan:

```powershell
pnpm openclaw gateway run
```

Node 24.16.0, OpenClaw 2026.10.3, dan plugin WhatsApp 2026.10.3 tersedia pada `.local/`. Launcher memilih Node yang kompatibel itu. Folder `.local/` menyimpan state utama dan credential lokal; jangan commit atau membagikannya.

## Percakapan peserta

Semua nomor dapat langsung mengirim DM tanpa pairing code peserta. Untuk mengakses tracker, setiap peserta tetap login Google dan mengaktifkan tracker pribadi melalui alur `daftar`. Pairing QR hanya berlaku untuk sesi ponsel akun bot, bukan peserta.

- “Saya mau menghubungkan tracker” untuk login Google, memilih tracker, dan konfirmasi DM.
- “Tolong catat zuhurku tiga, tadi juga sudah dhuha” untuk mencatat beberapa aktivitas.
- “Dua hari lalu aku baca Quran dua setengah halaman” untuk menyebut tanggal dan angka dengan bahasa sehari-hari.
- “Eh tilawah kemarin ganti jadi tiga halaman” untuk koreksi nilai.
- “Boleh lihat catatanku hari ini?” untuk rekap tracker sendiri.
- “Tolong lihat progress saya bulan ini” untuk total dan keterisian aktivitas bulanan sampai hari ini.
- “Kasih saja ringkasannya dalam format yang rapi” untuk membaca ulang periode rekap terakhir dalam percakapan yang sama (berlaku 30 menit).
- “Kembalikan pencatatan yang barusan” untuk undo seluruh kelompok terakhir dalam sepuluh menit jika nilainya belum berubah.
- “Akun saya sudah tersambung belum?” dan “Kamu bisa bantu apa saja?” untuk status dan panduan.

Tidak wajib memakai format khusus. Bot menanyakan informasi yang kurang; jawaban seperti “yang zuhur tiga aja” melengkapi pertanyaan aktif peserta yang sama selama sepuluh menit, termasuk ketika tanggal berganti. Jika belum lengkap, seluruh batch menunggu. Permintaan putus koneksi atau hapus akun selalu meminta konfirmasi terlebih dahulu. Perintah singkat lama tetap tersedia.

Instruksi jelas dengan awalan seperti “tolong isi hari ini, subuh 3, zuhur 2, ashar 3, maghrib 3, isya 2” dan permintaan merapikan rekap diproses tanpa panggilan model. Bahasa bebas lain tetap bergantung ketersediaan dan batas panggilan provider; pesan yang ditolak belum ditulis dan tidak diputar ulang otomatis.

Pesan beberapa baris, “lihat status hari ini”, “putuskan koneksi”, angka sederhana dalam kata, serta tanggal seperti “dua hari lalu” dapat diproses langsung. Bahasa bebas lain memakai prioritas provider sehat, maksimal dua percobaan/enam detik per percobaan dan deadline interpretasi 12 detik. Detail provider berada di halaman privasi; consent terbaru pada onboarding dan DM memakai kebijakan yang sama. Lihat [ADR 0012](docs/adr/0012-conversation-and-reminders.md).

Bahasa bebas memerlukan persetujuan AI saat onboarding atau lewat DM. Jika tracker sudah aktif tetapi AI belum diizinkan, kirim instruksi bebas lalu balas “setuju” pada penjelasan bot; permintaan awal dilanjutkan tanpa login Google ulang. Persetujuan berlaku untuk peserta itu sendiri dan pertanyaan berlaku sepuluh menit. Status koneksi juga menampilkan status AI.

Maksimal lima aktivitas per pesan, skor salat 0–3, rawatib dalam kali pelaksanaan, tilawah dalam halaman. Model hanya mengusulkan intent; otorisasi, tanggal, range, validasi, dan penulisan dipegang backend. Permintaan di luar fitur SDJ, increment, dan gabungan beberapa jenis tindakan dalam satu pesan belum didukung. Rekap bulanan memerlukan seluruh tanggal periode tersebut pada header tracker dan tidak menebak target pribadi.

Saat menghubungkan tracker, **Validasi & perbaiki** menormalkan 15 aktivitas pada seluruh tanggal yang dikenali. Nilai yang jelas dikonversi otomatis (termasuk teks angka sesuai locale, teks TRUE/FALSE, dan 0/1 pada checkbox); nilai tidak valid dicadangkan lalu dikosongkan. Semua aturan mengikuti katalog SDJ. Rumus tepat di sel input diganti hasil yang valid; rumus rekap, target, catatan pribadi dan tampilan dipertahankan. Rekam nilai/rumus/aturan asal disimpan di tab cadangan tersembunyi pada file yang sama dan diverifikasi sebelum perubahan. Proses berjalan bertahap dan dilanjutkan otomatis, termasuk setelah refresh browser. Aktivasi tetap melalui konfirmasi DM. Izin edit, proteksi/merge atau struktur ambigu tetap membutuhkan penyelesaian akses/struktur, bukan dipaksakan lolos. Perbaikan tidak dibatalkan oleh undo catatan maupun rollback kode. Lihat [ADR 0009](docs/adr/0009-complete-tracker-normalization.md).

## Reminder dan nama sapaan

Peserta dengan akun, identitas WhatsApp, Google, dan tracker aktif mendapat pengingat pukul **07.00, 13.00, 20.00 WIB**, termasuk ketika SDJ sudah terisi. Template dan routing reminder memakai nol token AI serta tidak membaca Sheets. `reminder mati`, `reminder aktif`, dan `status reminder` diproses langsung. Fitur operasional memakai `REMINDERS_ENABLED`, default false; lihat [runbook reminder](docs/runbooks/reminders.md) dan status deployment sebelum mengaktifkan.

Nama sapaan berasal dari profil Google yang diizinkan. Peserta lama dapat mengirim `perbarui profil` untuk memberi izin profil tanpa memilih atau memperbaiki tracker ulang; sampai itu, sapaan tetap umum. Pengaturan ini tidak memerlukan persetujuan AI.

## Pemeriksaan pengembangan

```powershell
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
pnpm test:integration
pnpm eval:ai
pnpm maintenance
```

Integration tests memakai Supabase utama dengan peserta sintetis, role terbatas, dan adapter Sheets sintetis. Hentikan worker dan gateway sebelum menjalankannya agar worker tidak mengambil job fixture. Unit dan E2E tidak memanggil layanan eksternal. Evaluasi AI live harus dipanggil eksplisit, misalnya `pnpm eval:ai --conversation --live --provider=groq --limit=1` untuk dataset percakapan; laporan dan resume tersimpan di `.local/evaluation/`.

Migrasi utama tersimpan di `supabase/migrations/` dan telah diterapkan melalui konektor Supabase. `pnpm db:status`/`pnpm db:migrate` untuk administrasi memerlukan `DATABASE_URL_MIGRATOR`; API/worker tidak memakai credential tersebut. Jangan menjalankan SQL prototipe lama.

## Dokumentasi

- [Tutorial Google dari tombol ke tombol](docs/runbooks/google-oauth.md)
- [Deployment dan operasional VPS](docs/runbooks/vps-deployment.md)
- [Deployment domain dan hosting Diskon.com](docs/runbooks/diskon-deployment.md)
- [Operasional dan pemulihan](docs/runbooks/operations.md)
- [Status implementasi dan bukti pengujian](docs/IMPLEMENTATION_STATUS.md)
- [Keputusan lingkup v2](docs/adr/0001-primary-environment-full-mvp.md)
- [Spike dan gate OpenClaw](docs/spikes/openclaw-channel.md)
- [Instruksi kontribusi](docs/AGENTS.md)

Aplikasi belum dinyatakan siap pilot sebelum pairing, onboarding nyata, uji dua identitas, evaluasi AI lengkap, dan pemulihan backup dibuktikan. Prototipe lama disimpan di `legacy/` lokal dan dapat dipulihkan dari Git; folder tersebut bukan bagian runtime.
