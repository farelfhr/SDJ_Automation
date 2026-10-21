# ADR 0012 — Percakapan ramah dan pengingat SDJ

Tanggal: 19 Oktober 2026. Keputusan: implementasi sesuai rencana yang disetujui pemilik. Menggantikan batas fallback dan tampilan consent pada ADR 0010; tidak mengaktifkan staging 9Router pada ADR 0011.

## Percakapan dan pemahaman

Backend menyusun pesan melalui renderer terpusat: judul, tanggal Indonesia, nilai/satuan, bullet dan quote. Blank, nol, dan false tetap berbeda. Bahasa memakai aku/kamu; detail provider ada pada halaman privasi. AI hanya mengusulkan intent JSON, bukan menghasilkan balasan atau menentukan keberhasilan penulisan. Journal, pemeriksaan hasil, undo, dan isolasi peserta dipertahankan.

Parser menerima perintah singkat, angka dalam kata, koma desimal, beberapa aktivitas, tanggal relatif sederhana, kontrol reminder dan pembaruan profil. Pola harus mengenali seluruh pesan; teks tambahan yang tidak dikenal tidak dibuang. Input ambigu tetap meminta klarifikasi. Contoh batch dengan satu tanggal relatif menggunakan tanggal yang sama untuk seluruh item sampai ada acuan tanggal lain.

Consent menggunakan `free-providers-v2` pada sesi onboarding baru, chat, dan reservasi provider. Sesi lama tetap menyimpan kebijakan asal. Pending consent dipertahankan ketika peserta mengirim perintah langsung; pesan bebas tambahan mendapat pengingat singkat tanpa mengganti permintaan awal. Setelah persetujuan, permintaan awal tetap tersedia ketika worker perlu retry sebelum hasil terminal tersimpan.

Prioritas provider adalah Groq → Gemini → OpenRouter → NVIDIA. SQL memilih target sehat pertama dari daftar, menjaga kuota bersama, cooldown, dan gate consent. Maksimal dua percobaan, enam detik per percobaan, deadline luar 12 detik. Reservasi yang baru selesai setelah deadline diselesaikan sebagai gagal tanpa memanggil model. Usage total yang dilaporkan provider dan durasi percobaan disimpan; usage yang tidak tersedia tetap NULL. Rute parser/pending/AI dicatat pada command tanpa menyimpan isi percakapan dalam log.

Adapter WhatsApp 2026.10.3 mengubah CommonMark ke sintaks WhatsApp. Karena `*teks*` di CommonMark berarti italic, bridge mengubah bold native menjadi `**teks**` sekali sebelum adapter. Converter terpasang telah diperiksa menghasilkan bold, bullet dan quote yang benar.

## Reminder

Semua peserta dengan user, identitas WhatsApp, koneksi Google dan tracker aktif menerima pengingat pada 07.00, 13.00, 20.00 Asia/Jakarta, termasuk jika sudah mengisi SDJ. Preferensi peserta default aktif dan dapat diubah lewat `reminder aktif`, `reminder mati`, atau `status reminder`. `REMINDERS_ENABLED` adalah sakelar operasional API dan worker; default false.

Worker memeriksa jadwal setiap 30 detik, batch maksimal 20 peserta. Reminder memakai sembilan template deterministik, tanpa AI atau pembacaan Sheets. Jadwal sebelum waktu aktivasi tidak di-backfill. Kejadian unik per peserta/tanggal WIB/slot, memiliki lease 60 detik dan kedaluwarsa 30 menit. Insert outbox dan perubahan status kejadian berada dalam transaksi tenant yang sama.

Outbox mendukung sumber balasan atau reminder dengan CHECK/FK yang berbeda, termasuk kesesuaian identitas penerima. Tujuan reminder didekripsi dari identitas terverifikasi, bukan chat buatan. Balasan chat diprioritaskan. Kelayakan penerima diperiksa kembali saat claim; opt-out/disconnect membatalkan reminder yang masih pending. Kegagalan yang pasti sebelum pengiriman dibatasi tiga percobaan. Pengiriman tidak pasti menjadi `delivery_unknown` dan tidak dikirim ulang otomatis. Tidak menjanjikan exactly-once pada jaringan WhatsApp.

Migrasi kompatibilitas `20261019092921_reminder_rollback_cleanup.sql` menambahkan cascade untuk kejadian reminder saat identitas/akun dihapus, agar maintenance versi lama tetap dapat menyelesaikan penghapusan akun setelah rollback. Transaksi sintetis tanpa job/delivery memverifikasi cascade lalu di-rollback.

Role scheduler hanya mengeksekusi fungsi terbatas; role aplikasi tetap terikat tenant/RLS. Retensi 30 hari dan penghapusan akun mencakup kejadian reminder setelah dependency delivery dibersihkan. Rollback ke aplikasi lama memakai overload claim dua parameter yang menolak reminder.

## Nama Google

Onboarding menambahkan scope `profile`, mengambil `given_name` lalu `name`, membersihkan format/karakter kontrol dan membatasi 40 karakter. Nama disimpan terenkripsi dan tidak ditambahkan ke prompt. Tanpa nama, sapaan tetap umum.

Perintah `perbarui profil` membuka sesi dengan purpose profile dan scope `openid profile`. Callback harus cocok dengan subject Google serta identitas aktif peserta. Alur tidak memilih file, menormalisasi tracker, mengganti token aktif, atau mengubah preferensi AI. Pembatalan memeriksa OAuth state dan tidak mengganggu koneksi aktif.

## Validasi dan batas bukti

Unit/E2E memakai adapter sintetis. Integration memakai Supabase utama dengan dua identitas sintetis, account kanal terpisah, dan worker produksi dihentikan selama pengujian. Seluruh fixture dibersihkan sebelum worker dinyalakan. Integration akhir dari VPS lulus 24 kasus, termasuk pemulihan consent setelah klarifikasi langsung. percobaan Windows sebelumnya mengalami timeout koneksi pooler dan tidak dianggap kelulusan.

Evaluasi percakapan live memakai 17 kasus sintetis. Pola hapus akun yang jelas dan permintaan increment juga dikenali backend; increment diarahkan ke permintaan total akhir. Klarifikasi baru tidak boleh mengaku melanjutkan pending yang tidak ada. Mode default menguji parser terlebih dahulu lalu model; `--model-only` menguji adapter saja. Perbandingan menerima ekspresi tanggal yang menghasilkan efek domain sama, tetapi tetap menolak tanggal/nilai berbeda dan kelanjutan pending yang hilang. Report dibedakan menurut fingerprint prompt dan mode, menyimpan hasil intent sintetis serta riwayat tanggal percobaan. Lihat status implementasi untuk hasil akhir dan status aktivasi.

Status akhir: release `20261019T090338Z` aktif dengan reminder enabled. 241 unit, 34 E2E, 24 integration dan 17 evaluasi percakapan lulus. Pesan contoh mendapat receipt satu attempt dan pemilik mengonfirmasi tampil rapi. Lihat runbook deployment untuk backup dan rollback.
