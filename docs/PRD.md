# PRD: SDJ Assistant

Versi dokumen: 1.0.0  
Tanggal: 15 Oktober 2026  
Status: spesifikasi awal untuk implementasi, belum merupakan aplikasi yang berjalan  
Nama kerja: SDJ Assistant. Nama produk final dapat diganti tanpa mengubah domain.

## 1. Ringkasan produk

SDJ Assistant membantu peserta mencatat aktivitas pada tracker Spiritual Development Journey melalui pesan WhatsApp. Setiap peserta memiliki spreadsheet pribadi. Backend menghubungkan identitas pengirim yang terverifikasi dengan tracker dan izin Google peserta tersebut. Pesan sederhana diproses tanpa model AI. Bahasa bebas dapat diproses melalui beberapa provider AI dengan fallback terkontrol.

Hasil utama yang dijanjikan adalah pencatatan pada aktivitas, tanggal, dan tracker yang benar, disertai status yang jujur dan cara memperbaiki kesalahan. AI membantu interpretasi. Identitas, otorisasi, perhitungan tanggal, pemetaan sel, dan penulisan tetap menjadi tanggung jawab kode aplikasi.

Dokumen terkait:

- [ARCHITECTURE.md](ARCHITECTURE.md): komponen, alur, batas kepercayaan, keputusan teknis, dan operasi.
- [SCHEMA.md](SCHEMA.md): kontrak data, model database, status, dan invariants.
- [AGENTS.md](AGENTS.md): instruksi kerja Claude Code/Codex dan urutan implementasi.

## 2. Masalah dan konteks

Peserta wajib mengisi tracker berulang kali. Membuka spreadsheet, mencari tanggal, dan memilih baris aktivitas menambah langkah pada aktivitas yang sebenarnya singkat. Peserta lain memiliki kebutuhan sama tetapi tidak memiliki akses ke tracker peserta lainnya. Otomasi harus mempertahankan pemisahan tersebut.

Konteks sumber yang telah dibaca dalam sesi perancangan:

| Fakta sumber | Implikasi produk |
| --- | --- |
| Nama tab yang sesuai adalah `NEW SDJ v1.2` | Gunakan nama ini sebagai template awal, jangan mengasumsikan nama dari judul percakapan |
| File sumber berformat Excel `.xlsx` di Google Drive | Pengguna perlu versi Google Sheets native sebelum aktivasi connector Sheets |
| Header tanggal berada di baris 7, mulai kolom J | Sistem mencari tanggal sebenarnya, bukan memakai nomor kolom tetap |
| Salat fardu berada di baris 9 sampai 13 dengan pilihan 0, 1, 2, 3 | Kelima aktivitas dapat menjadi lingkup awal |
| Kolom B sampai I memuat target dan rumus progres | Area ini tidak menjadi target tulis bot |
| Ada aktivitas dengan satuan dan rumus yang perlu dikonfirmasi | Jangan mengaktifkan seluruh aktivitas hanya berdasarkan nama baris |

Sumber pengguna yang dipilih: [file tracker](https://drive.google.com/file/d/1ebB-x2FlXAEMbV8vEvU0BzSwfWXnEUG0t_DxNRWKVGA). ID dan data peserta asli tidak boleh disalin ke fixture atau seed repository. Observasi ini bukan validasi seluruh workbook dan bukan hasil konversi yang sudah diuji.

## 3. Sasaran, pengguna, dan batas produk

### Sasaran

1. Mengurangi langkah pencatatan harian menjadi satu pesan untuk perintah yang lengkap.
2. Menjaga agar pembaruan hanya mengenai tracker milik peserta yang terhubung.
3. Menjaga pencatatan dasar tetap tersedia saat API AI dibatasi.
4. Menampilkan tanggal, aktivitas, nilai, dan status yang dapat diperiksa pengguna.
5. Menyediakan dasar codebase yang mudah diuji dan dikembangkan oleh mahasiswa dengan bantuan coding agent.

### Pengguna

| Peran | Hak dan kebutuhan |
| --- | --- |
| Peserta | Menghubungkan tracker, mencatat, membaca rekap sendiri, mengoreksi, membatalkan pembaruan yang memenuhi syarat, memutus koneksi |
| Operator teknis | Mengelola layanan, model, kuota, dan kegagalan tanpa akses rutin ke isi ibadah peserta |
| Pengelola program | Pemangku kepentingan untuk aturan tracker. Tidak mendapat akses data peserta melalui produk secara otomatis |

Peserta adalah unit isolasi data. Kelompok/program belum menjadi tenant organisasi pada MVP. Tidak ada fitur admin untuk membaca tracker semua peserta.

### Termasuk MVP

- Satu nomor bot untuk banyak peserta melalui DM, satu identitas WhatsApp aktif dan satu tracker aktif per peserta.
- Onboarding Google OAuth dan pemilihan satu Google Sheet.
- Lima salat fardu dengan operasi `set`, bantuan, rekap hari ini, koreksi, dan undo terbatas.
- Tanggal hari ini dan tanggal lampau eksplisit maksimal 31 hari ke belakang.
- Parser deterministik serta interpretasi AI opsional dengan dua provider pertama, Gemini dan Groq.
- Log perubahan, deduplikasi, antrean persisten, pembatasan pemakaian per peserta, dan penanganan status penulisan yang tidak pasti.
- Alur putus koneksi dan penghapusan data aplikasi.

### Setelah MVP

- Aktivitas tambahan setelah satuan, rentang, tipe boolean, dan rumus rekap disepakati.
- Beberapa item per pesan, maksimal lima, setelah jalur satu item terbukti.
- Operasi tambah, voice note, pengingat, rekap mingguan, banyak tracker, dan dukungan kanal tambahan.
- Pengingat memerlukan jadwal, izin pengguna, dan verifikasi aturan kanal. Tidak aktif secara default.

### Di luar lingkup

- Menilai kesalehan, memberikan fatwa, atau menafsirkan kewajiban agama.
- Menyimpulkan ibadah selesai dari waktu pesan, lokasi, atau pesan yang tidak eksplisit.
- Mengganti skor/rumus/target program, membuat tracker baru otomatis, atau mengonversi file sumber tanpa tindakan onboarding yang jelas.
- Membuka akses antar peserta, dashboard pemantauan kelompok, pembayaran, atau jaminan AI gratis tanpa batas.
- Menjalankan shell, browser, atau tool spreadsheet umum berdasarkan instruksi chat.

## 4. Prinsip perilaku

1. **Identitas berasal dari kanal.** Nama atau nomor yang diketik dalam pesan tidak menentukan pengguna.
2. **Bahasa bebas boleh fleksibel, perubahan data tetap ketat.** Output model adalah usulan yang harus divalidasi.
3. **Satu sumber nilai harian.** Pada MVP, spreadsheet adalah sumber nilai aktivitas. Database menyimpan journal operasi dan konfigurasi, bukan salinan lengkap tracker.
4. **Blank berbeda dengan nol.** Skor 0 adalah input eksplisit. Kosong berarti belum diisi. Sistem tidak menebak makna agama dari skor 0.
5. **Tidak mengaku berhasil sebelum verifikasi.** Penulisan yang belum pasti harus dinyatakan sedang diperiksa.
6. **Privasi standar.** Tidak ada ranking peserta, akses pengelola program, atau pengiriman seluruh riwayat ke model.
7. **Tetap berguna tanpa AI.** Perintah berformat jelas, rekap, bantuan, dan undo tidak memerlukan model.

## 5. Perjalanan pengguna

### A. Pendaftaran dan penautan

1. Peserta mengirim `daftar` melalui DM ke bot.
2. Backend membuat sesi onboarding singkat dan sekali pakai yang terikat pada identitas kanal asal.
3. Peserta membuka tautan HTTPS, menghubungkan akun Google, lalu memilih tracker melalui Google Picker.
4. Backend memeriksa izin edit, MIME Google Sheets, tab, header tanggal, dan label aktivitas.
5. Bot mengirim challenge konfirmasi ke DM asal. Peserta mengonfirmasi dari identitas yang sama.
6. Tracker aktif hanya setelah seluruh pemeriksaan dan challenge selesai. Login Google saja belum cukup.

Tidak meminta password Google atau kode MFA melalui chat. Peserta yang hanya punya hak viewer diarahkan meminta editor kepada pemilik file, tanpa menyatakan sudah terhubung.

### B. Pencatatan

Peserta: `zuhur, 3`  
Bot setelah verifikasi: `Tersimpan: Zuhur, 15 Oktober 2026, skor 3.`

Jika sel sebelumnya bernilai 2, balasan menyebut `Skor 2 diubah menjadi 3`. Jika sudah bernilai 3, balasan `Sudah tercatat 3. Tidak ada perubahan.` Tidak membuat mutation untuk no-op.

### C. Klarifikasi

Peserta: `zuhur`  
Bot: `Skor Zuhur berapa? Pilih 0, 1, 2, atau 3.`

Jawaban `3` hanya melanjutkan satu pending command pada percakapan yang sama dan belum kedaluwarsa. Tanpa pending command, angka tunggal tidak menyebabkan perubahan.

### D. AI tidak tersedia

Peserta: kalimat bahasa bebas yang parser tidak dapat selesaikan.  
Bot: `Pemahaman bahasa bebas sedang tidak tersedia. Catat dengan format seperti "zuhur, 3". Pesan tadi belum mengubah tracker.`

Bahasa bebas tidak diantrekan diam-diam sampai esok hari. Retry otomatis hanya dalam deadline request yang ditentukan. Pengguna perlu mengirim ulang atau memakai format sederhana.

### E. Penulisan tidak pasti

Jika permintaan tulis timeout dan hasilnya belum bisa dipastikan: `Pencatatan belum dapat dipastikan. Saya sedang memeriksa hasilnya. Jangan kirim ulang dulu.` ID operasi dapat ditampilkan sebagai referensi dukungan yang tidak mengandung identitas.

Perintah baru pada tracker yang sama menunggu penyelesaian kondisi tersebut. Penerimaan pesan tetap berjalan. Sistem tidak memanggil model cadangan untuk mengulangi penulisan.

### F. Putus koneksi

`putus koneksi` memerlukan konfirmasi sekali, mencabut koneksi aplikasi bila memungkinkan, menghapus token lokal, menonaktifkan tracker, dan menghentikan pekerjaan tulis yang belum berjalan. File spreadsheet peserta tidak dihapus. Bila mutasi sedang dikirim, statusnya direkonsiliasi sebelum penutupan final.

## 6. Kontrak perintah

| Input | Hasil yang diharapkan | Status MVP |
| --- | --- | --- |
| `zuhur, 3` / `dzuhur 3` / `dhuhr 3` | Set skor Zuhur hari ini menjadi 3 | Aktif |
| `subuh kemarin 2` | Set pada tanggal kemarin berdasarkan waktu terima pertama | Aktif |
| `isya 2026-10-14 3` | Set pada tanggal eksplisit | Aktif |
| `zuhur 8` | Tolak, tidak menulis | Aktif |
| `zuhur` | Tanya skor | Aktif |
| `rekap hari ini` | Baca nilai lima salat, bedakan blank dan 0 | Aktif |
| `batal` | Undo mutation terakhir yang eligible, bukan membatalkan semua pesan | Aktif |
| `bantuan` / `status` | Bantuan atau status koneksi dan operasi sendiri | Aktif |
| `hapus zuhur hari ini` | Clear sel setelah konfirmasi, simpan nilai sebelumnya | Opsional setelah core, bukan prasyarat pilot |
| `tilawah 5` | Set lima halaman setelah profil aktivitas disahkan | Setelah MVP |
| `tilawah tambah 2` | Penambahan dengan pengendalian konflik khusus | Ditunda |
| `sunnah sudah` | Tanya aktivitas yang dimaksud | Tidak menebak |
| `isi milik peserta B` | Tolak pemilihan identitas/target dari isi pesan | Aktif |

Skor salat adalah angka menurut tracker. Detail interpretasi skor mengikuti aturan pengelola template. Bot tidak menyimpulkan skor 3 hanya dari kata `sudah`.

## 7. Aturan tanggal, perubahan, dan undo

- Zona waktu awal `Asia/Jakarta`, dapat diganti peserta melalui pengaturan terverifikasi.
- Hari ini dihitung dari `inbound_messages.received_at` pertama di server dan snapshot zona waktu peserta. Nilai ini dibekukan ketika command dibuat.
- Tanggal kirim dari kanal dipakai untuk mendeteksi pesan lama, bukan mengganti acuan secara diam-diam. Pesan yang tampak tertunda lebih dari 30 menit memerlukan konfirmasi tanggal sebelum penulisan otomatis.
- Tanggal eksplisit menggunakan format ISO `YYYY-MM-DD` pada parser MVP. Format tanggal lain hanya diterima jika interpretasinya tidak ambigu dan dikonfirmasi bila perlu.
- Tolak tanggal masa depan, tanggal di luar 31 hari lampau, atau tanggal yang tidak ada pada header.
- Pembaruan pada tanggal yang sudah terisi diizinkan untuk `set` eksplisit. Balasan menyebut perubahan nilai.
- Undo hanya mutation terakhir yang terverifikasi, milik pengguna tersebut, belum dibatalkan, maksimal 10 menit sejak selesai, dan nilai sel saat ini masih sama dengan nilai hasil mutation.
- Undo diproses sebagai mutation baru dengan relasi ke mutation asal. Jika sel sudah berubah melalui edit manual atau mutation lain, undo ditolak dengan penjelasan.
- Sheets tidak menyediakan transaksi bersama database aplikasi. Jaminan operasi persis sekali lintas kedua sistem tidak diklaim.

## 8. Persyaratan fungsional

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| F01 | Identifikasi peserta dari ingress terautentikasi | Body chat tidak dapat mengganti actor atau tracker |
| F02 | Onboarding terikat kanal dan OAuth | Link diteruskan tidak mengaktifkan tracker tanpa konfirmasi kanal asal |
| F03 | Validasi template | File non-native, viewer-only, tanggal duplikat, atau label tidak sesuai menolak aktivasi |
| F04 | Parser tanpa AI | Kasus grammar valid memanggil 0 provider AI |
| F05 | AI terstruktur | Hanya action, activity, date reference, dan value yang diizinkan |
| F06 | Routing Gemini/Groq | Kegagalan provider eligible berpindah dalam batas percobaan dan deadline |
| F07 | Cooldown bersama | Worker lain tidak terus mencoba bucket kuota yang sedang diblokir |
| F08 | Validasi perintah | Nilai/rentang/tanggal invalid tidak menghasilkan Sheets write |
| F09 | Isolasi tenant | Pengguna A tidak dapat mengakses connection, command, mutation, atau delivery B |
| F10 | Deduplikasi inbound | ID pesan sama menghasilkan paling banyak satu command aktif |
| F11 | Write journal dan rekonsiliasi | Timeout setelah write tidak memicu replay buta |
| F12 | Balasan berbasis hasil | Pesan sukses hanya setelah nilai dibaca kembali atau hasil terverifikasi sesuai kebijakan |
| F13 | Rekap sendiri | Membaca tracker sendiri, tidak memakai angka lama dari percakapan AI |
| F14 | Klarifikasi terikat percakapan | Jawaban singkat hanya mengisi pending command yang tepat dan belum kedaluwarsa |
| F15 | Undo bersyarat | Berhasil hanya bila seluruh syarat pada bagian 7 terpenuhi |
| F16 | Pencabutan akses | Tidak ada write baru setelah koneksi dinonaktifkan |
| F17 | Status gangguan | Semua provider AI gagal tetap menyisakan parser dan bantuan |
| F18 | Log dan retensi | Tidak ada token atau isi ibadah dalam log operasional standar |

## 9. Persyaratan nonfungsional dan ukuran keberhasilan

Angka berikut adalah target desain dan kriteria pilot, bukan hasil pengukuran.

| ID | Target |
| --- | --- |
| N01 | Tidak ada keberhasilan akses lintas peserta pada suite pengujian negatif wajib |
| N02 | Parser menghasilkan 100% hasil benar pada fixture grammar yang disepakati, termasuk penolakan |
| N03 | Model yang diaktifkan mencapai minimal 98% exact-match aktivitas, operasi, tanggal, dan nilai pada set evaluasi berlabel. Nol false-write pada contoh invalid, ambigu, dan prompt injection. Setiap kegagalan kritis lintas target memblokir rilis |
| N04 | p95 waktu proses jalur parser hingga hasil terverifikasi maksimal 5 detik dalam kondisi dependency sehat pada beban pilot |
| N05 | p95 interpretasi bahasa bebas selesai atau turun ke bantuan format sederhana maksimal 15 detik, penulisan dapat menambah waktu |
| N06 | Baseline uji beban 100 peserta, 10 pesan masuk per menit selama 15 menit. Gunakan fake AI/Sheets untuk load test, bukan membakar kuota nyata |
| N07 | Semua pesan yang sudah di-ack ingress persisten tidak hilang saat worker restart |
| N08 | Tidak ada duplikasi mutation aplikasi pada uji redelivery, crash, retry, dan timeout yang ditetapkan |
| N09 | Backup database harian terenkripsi, target kehilangan data maksimal 24 jam dan pemulihan maksimal 4 jam, dibuktikan melalui drill sebelum pilot |
| N10 | Ketersediaan end-to-end dilaporkan terpisah dari kesehatan backend. Tidak menjanjikan SLA saat dependency gratis belum stabil |

Metrik produk: keberhasilan pencatatan, waktu penyelesaian, frekuensi klarifikasi, tingkat koreksi, rasio parser, fallback rate, pesan yang tertunda, dan keluhan salah tanggal. Frekuensi ibadah bukan metrik keberhasilan teknis yang dikumpulkan lintas peserta.

## 10. Privasi dan retensi awal

- Peserta mengetahui bahwa layanan dan provider AI yang dipilih dapat memproses pesan mereka. Cantumkan daftar provider yang benar-benar aktif saat onboarding.
- Prompt hanya berisi pesan relevan dan katalog aktivitas minimal. Tidak menyertakan nomor telepon, token, spreadsheet ID, atau seluruh riwayat.
- Metadata operasional tidak memuat isi pesan. Raw text terenkripsi disimpan maksimal 7 hari untuk klarifikasi/debug terbatas. Mutation journal terenkripsi disimpan 90 hari. Dedupe key tanpa isi disimpan 90 hari. Provider attempts dan metrik teknis disimpan 30 hari.
- Token disimpan terenkripsi sampai diputus, dicabut, atau akun dihapus. Sesi onboarding maksimal 10 menit. Klarifikasi maksimal 10 menit.
- Penghapusan akun aplikasi memerlukan konfirmasi kanal. Data aktif dihapus atau dipseudonimkan dalam maksimal 7 hari. Backup berumur maksimal 30 hari habis sesuai rotasi, dengan tombstone penghapusan diterapkan ketika restore.
- Kebijakan retensi ini adalah keputusan produk awal yang perlu disahkan pemilik produk sebelum pilot. Bukan klaim kepatuhan hukum yang sudah diaudit.

## 11. Tahapan dan release gate

| Tahap | Deliverable | Gate selesai |
| --- | --- | --- |
| G0: spike integrasi | Bukti ingress OpenClaw memiliki identitas tepercaya, bypass AI untuk pesan sederhana, DM terpisah, outbound reply, dan disable auto-reply | Uji dua identitas sintetis, replay, restart, dan tidak ada konteks bersama. Versi OpenClaw dipin |
| M1: core lokal | Parser, domain, PostgreSQL, fake channel/Sheets, dedupe, worker, journal | Unit/integration test invariants dan pemulihan crash lulus |
| M2: Google | OAuth, Picker, validasi tracker, satu peserta test, write/readback/undo | Uji pada salinan Google Sheet dengan data sintetis, token expiry/revoke ditangani |
| M3: multiuser WhatsApp | Bridge terautentikasi, dua peserta dan dua tracker, pairing | Uji lintas peserta dan crash/outbox lulus |
| M4: AI fallback | Gemini/Groq, kontrak sama, circuit/cooldown, fairness | Evaluasi model dan semua-provider-gagal lulus, parser tetap berjalan |
| M5: pilot tertutup | 5 sampai 10 peserta sukarela, monitoring, backup, panduan pemulihan | Gate privasi, retensi, restore drill, biaya, dan template terpenuhi |

Tidak ada estimasi kalender yang menganggap credential, izin Google, dan kompatibilitas OpenClaw sudah tersedia. G0 mendahului komitmen pilot. Jangan membuat adapter berdasarkan nama API yang belum diverifikasi.

## 12. Risiko dan keputusan terbuka

| ID | Hal yang perlu diputuskan/divalidasi | Default saat belum selesai |
| --- | --- | --- |
| O01 | Apakah hook/plugin OpenClaw versi terpasang mendukung seluruh kebutuhan G0 | Fake channel, belum membuka pilot |
| O02 | Hak edit peserta dan kemungkinan kebijakan domain Google membatasi OAuth | Koneksi tidak diaktifkan tanpa read/write yang sah |
| O03 | Satuan rawatib, tipe input Murojaah, checkbox, dan formula rekap | Lima salat saja aktif |
| O04 | Model ID, dukungan JSON, kuota, dan kebijakan data provider | Model tidak aktif sampai diverifikasi dan dievaluasi |
| O05 | Hasil konversi Excel ke Sheets dan konsistensi seluruh rumus | Peserta memilih salinan native yang sudah diperiksa |
| O06 | Persetujuan retensi, layanan hosting, dan anggaran fallback berbayar | Tidak ada fallback berbayar otomatis |
| O07 | Definisi pelaporan kepada pengelola program | Tidak ada akses pengelola melalui aplikasi |

## 13. Definition of done produk awal

Selesai berarti dua peserta dapat menghubungkan tracker berbeda, mencatat dari WhatsApp, membaca hasil sendiri, dan mengoreksi tanpa kebocoran data. Duplikasi pesan, pergantian model, restart worker, penolakan izin Google, serta timeout write harus memiliki perilaku yang terbukti. Tersedia dokumentasi setup yang sesuai kode, catatan sumber teknis, hasil evaluasi model, dan runbook pemulihan.

Paket dokumentasi ini memenuhi tahap perancangan. Belum ada klaim aplikasi, OAuth, integrasi WhatsApp, migrasi database, atau evaluasi model telah diimplementasikan.
