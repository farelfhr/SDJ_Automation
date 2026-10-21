# ADR 0009 — Normalisasi seluruh input tracker

Tanggal: 19 Oktober 2026. Status: dideploy pada release `20261018T233308Z`, pukul 06.34 WIB. Menggantikan batas perbaikan parsial ADR 0007/0008 sesuai rencana yang disetujui pemilik.

## Perilaku

Kasus Al-Matsurat Petang L18 mengungkap penolakan sebelum perbaikan: `typedCell` menolak teks dan `validateValue` menolak angka pada aktivitas boolean. Onboarding kini membaca nilai mentah dan memakai satu normalizer deterministik untuk 15 aktivitas pada seluruh kalender yang dikenali. Tidak ada panggilan AI.

- Angka valid dipertahankan, termasuk 0 dan pecahan Tilawah. Teks angka literal mengikuti tanda desimal locale spreadsheet (`en_US` bila properti tidak tersedia), tanpa pemisah ribuan, eksponen, satuan, atau mata uang. Batas katalog tetap berlaku; tidak melakukan clamp, pembulatan, atau tebakan.
- Checkbox menerima boolean asli, teks TRUE/FALSE (trim/case-insensitive), serta angka/teks angka 0 dan 1 menjadi FALSE dan TRUE. Pasangan nilai custom checked/unchecked yang eksplisit pada aturan BOOLEAN asal dipetakan terlebih dahulu untuk menjaga makna asli.
- Isi yang tidak dapat dipastikan atau di luar domain dicadangkan lalu dikosongkan, termasuk boolean pada aktivitas angka. Blank tetap blank; 0 dan FALSE yang benar tetap dipertahankan.
- Rumus tepat di sel input harian dicadangkan dan diganti dengan hasil snapshot yang memenuhi konversi/domain; hasil error/tidak valid dikosongkan. Tidak mengevaluasi teks rumus melalui JavaScript. Rumus rekap, header, target/bobot dan semua sel di luar koordinat aktivitas/tanggal tidak disentuh.
- Semua aturan input menjadi aturan standar, termasuk aturan kompatibel yang sebelumnya terlalu sempit atau tidak ada. Rawatib bilangan bulat nonnegatif sampai batas safe integer; skor salat 0–3; Tilawah 0–100; aktivitas boolean checkbox standar. Pemeriksaan struktur tetap mengikuti ADR 0006 (100 baris, 12 kolom label, 2.000 kolom kalender).

## Rekam pemulihan dan batch

Sebelum mengubah nilai maupun aturan, adapter membuat tab tersembunyi `_SDJ_Backup_<run>` pada **file yang sama**, dikenali melalui developer metadata `sdj.repair.run.v1`. Ini bukan batas akses baru: editor file yang sudah memiliki akses dapat membuka cadangan. Tab internal tidak dimasukkan pilihan tracker. Catatan sel pribadi tidak ditimpa. Tidak ada secret atau credential di cadangan, log, maupun token kelanjutan.

Header memuat versi, run, source sheet ID, fingerprint, baris arsip berikutnya, penghitung, dan batch pending. Tiap rekam menyimpan lokasi/aktivitas, nilai/rumus/hasil snapshot/note/aturan asal, tujuan bertipe, aturan standar, alasan, dan status prepared/verified/conflict. JSON dipotong maksimal 40.000 unit UTF-16 tanpa memisahkan pasangan surrogate, disimpan sebagai string bertipe, dengan checksum kanonis SHA-256 serta identitas bagian. Baca ulang memverifikasi kelengkapan, checksum dan identitas batch sebelum menulis input. Cadangan tidak dipercaya sebagai otorisasi: lokasi dibatasi kembali terhadap layout aktif dan tujuan diregenerasi dari katalog serta snapshot asal.

Maksimum 500 sel input per langkah dan 1.000.000 byte per request. Ruang arsip dialokasikan sebelum manifest menunjuk baris baru. Manifest pending persisten sebelum bagian backup dikirim. Sebelum input write, struktur/proteksi/merge dan sumber dibaca ulang. Nilai/aturan/note yang berbeda membatalkan rencana lama dan dinormalisasi ulang pada langkah berikutnya. Nilai tujuan yang sudah terbukti tersimpan tidak dikirim ulang. Status rekam dan penghitung selesai diperbarui bersama manifest dalam satu batch Google; tidak mengklaim transaksi dengan database atau compare-and-swap terhadap manusia.

Timeout pada pembuatan tab, alokasi, penyiapan backup, penulisan input, atau penyelesaian hasil dipulihkan dari manifest dan data aktual. Bagian backup yang belum lengkap dibangun ulang hanya bila rencana sumber masih sama; rencana berbeda ditinggalkan tanpa replay nilai lama. Backup harus terverifikasi terlebih dahulu. Kesalahan akses, struktur ambigu, proteksi/merge, atau kerusakan manifest dilaporkan sebagai kendala akses/struktur/pemulihan, bukan dilewati dengan menulis sel yang tidak diketahui.

## API dan browser

`TrackerGateway.repairStep` merupakan port opsional agar adapter/fake lama tetap kompatibel. Google memakai port ini untuk satu langkah; `validate` tetap tersedia sebagai wrapper sinkron terbatas dan **bukan** probe read-only.

`POST /connect/tracker` menerima `repair_version: 1` serta `continuation_token` opsional. Selama proses mengembalikan HTTP 202 dengan `accepted:false`, `repairing:true`, token dan progres; hasil akhir tetap HTTP 200 `{accepted:true, configuration}`. Klien lama yang belum mendukung progres mendapat HTTP 409 `CLIENT_UPDATE_REQUIRED`, sehingga tidak salah mengklaim sudah ada challenge. Token AES-GCM mengikat user, sesi browser, koneksi Google, file, tab, run, fingerprint, dan expiry sesi; tidak berisi nilai aktivitas. Fingerprint berbeda memerlukan langkah pengenalan ulang sebelum perubahan berikutnya. Konfirmasi DM dan CSRF tetap wajib; tidak memperpanjang TTL sesi OAuth/onboarding.

Browser menyimpan konteks kelanjutan di `sessionStorage`, melanjutkan otomatis antar-batch dan setelah refresh. Gangguan sementara memakai backoff maksimal lima kegagalan berturut-turut; HTTP 429 Google diberi jeda 61 detik (`retryAfterMs`) agar batch besar melewati jendela kuota tanpa klik tambahan. Progres tetap dapat dilanjutkan setelah koneksi pulih. Respons akhir yang hilang dipulihkan dari status `channel_confirmation`, tanpa membuat challenge kedua. Kandidat tracker/binding/challenge hanya dibuat setelah scan akhir seluruh input lolos. `repairedValidationCells` dan `resetInputCells` dipertahankan; `convertedInputCells` ditambahkan. Penghitung didasarkan pada rekam terverifikasi, tidak menggandakan hasil retry.

Tidak ada migrasi database, perubahan scope/credential, atau reset gateway WhatsApp. Perbaikan berlaku saat onboarding/validasi ulang. `inspect`, rekap dan write percakapan tetap memakai validasi normal; tidak melakukan migrasi diam-diam saat membaca catatan. Koneksi aktif dan fingerprint acuan lama tetap kompatibel. Membatalkan onboarding atau rollback kode tidak membatalkan perubahan Sheets; rekam pemulihan tetap berada pada file dan undo bot hanya berlaku untuk pencatatan harian.

## Verifikasi dan peluncuran

Fixture sepenuhnya sintetis menguji matriks nilai, L18, seluruh aktivitas/tanggal, locale, rumus input, data/note/format/rekap yang dipertahankan, 701 tanggal, batas batch/payload, backup panjang/Unicode, alokasi yang terputus, refresh dengan adapter baru, timeout seluruh fase, readback yang gagal, edit bersamaan dan perubahan fingerprint. Uji otorisasi menolak token silang peserta/sesi/koneksi/file/tab, token rusak/kedaluwarsa, dan rencana cadangan di luar wilayah input. Uji browser membuktikan loop 202 sampai konfirmasi dan pemulihan respons akhir yang hilang. Unit/E2E/typecheck/lint/format/build serta pengujian sintetis di VPS wajib sebelum aktivasi; tidak memakai tracker peserta sebagai fixture. Kondisi file teman tetap perlu dibuktikan melalui onboarding peserta sendiri.

191 unit test dan 28 E2E serta typecheck/lint/format/build lulus lokal. Build dan seluruh 191 unit test sintetis di VPS lulus sebelum aktivasi. HTTPS publik memverifikasi halaman/aset, kontrak client kelanjutan, recovery sesi dan penolakan request tanpa sesi; API dan gateway ready, seluruh layanan aktif. Gateway tidak direstart. Release `20261018T161906Z` dipertahankan untuk rollback kode; rollback tidak mengembalikan nilai spreadsheet. Tidak menguji onboarding peserta atau mengubah tracker nyata saat deployment.

Rujukan resmi: [Sheet dan developer metadata](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets), [batch request](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request).
