# Pengingat SDJ

Pengingat berjalan melalui worker dan outbox PostgreSQL yang sudah ada; tidak memakai cron/model gateway. Jadwal tetap **07.00, 13.00, 20.00 WIB** dan tidak membaca nilai Sheets. Peserta aktif tetap diingatkan walau catatannya sudah terisi.

## Pengaturan peserta

- `status reminder`: preferensi peserta dan tiga jadwal.
- `reminder mati`: berhenti dan batalkan reminder yang masih antre.
- `reminder aktif` atau `ingatkan saya`: aktifkan kembali mulai jadwal berikutnya.
- `perbarui profil`: izinkan nama Google untuk sapaan; peserta lama mendapat sapaan umum sampai memberi izin profil.

Pengaturan reminder tidak memerlukan persetujuan AI. Nomor/grup/peserta lain tidak dapat dipilih melalui isi pesan.

## Aktivasi dan penghentian operasional

1. Terapkan migrasi `20261019085415_conversation_reminders.sql` dan `20261019092921_reminder_rollback_cleanup.sql` sebelum menjalankan kode baru.
2. Deploy API/worker dengan `REMINDERS_ENABLED=false`, jalankan pengujian sintetis, kemudian periksa pesan contoh pada akun uji yang ditunjuk pemilik.
3. Launcher dijalankan dengan working directory `/opt/sdj/current` dan menghitung ulang path bridge dari release aktif. Restart gateway sekali setelah kode bridge berubah agar converter terbaru dimuat; pertahankan direktori sesi WhatsApp. Sediakan jendela startup sampai 180 detik dan verifikasi ready serta connected.
4. Aktifkan `REMINDERS_ENABLED=true` pada environment backend, lalu restart API dan worker. Tidak perlu restart gateway untuk perubahan flag reminder.
5. Untuk menghentikan reminder, ubah flag menjadi false dan restart API serta worker. API membatalkan reminder pending saat claim; bila melakukan rollback segera, batalkan pending reminder melalui transaksi maintenance tenant sebelum mengganti release. Delivery leased dapat berada dalam pengiriman; hasil tidak pasti tidak diulang.

Jangan menjalankan worker lokal terhadap database utama bersamaan dengan integration fixtures. Integration harus memakai account sintetis dan worker produksi dihentikan dengan pemulihan otomatis melalui trap/finally.

## Pemeriksaan

- API dan gateway ready; API/worker/proxy/gateway/Caddy aktif.
- Log `REMINDER_SCAN_FAILED` menunjukkan scan perlu diperiksa; log tidak mencetak nomor, chat, nama, atau nilai ibadah.
- Periksa hitungan status reminder/outbox, keterlambatan `scheduled_at` ke `available_at`/`sent_at`, `delivery_unknown`, jumlah retry, dan opt-out secara agregat.
- `commands.interpretation_route` menunjukkan parser/pending/AI. `provider_attempts.tokens` NULL berarti tidak tersedia, bukan pemakaian nol; `duration_ms` menyimpan durasi percobaan.
- Hentikan pengiriman saat ada masalah penerima/duplikasi, periksa metadata lease dan dedupe tanpa menampilkan payload peserta.

Reminder terlambat lebih dari 30 menit dilewati. Pengaktifan pertama tidak mengirim kumpulan jadwal yang sudah lewat. P95 percakapan dan ketepatan jadwal nyata harus diukur dari pengamatan operasi; tes sintetis atau satu pesan contoh tidak membuktikan P95.
