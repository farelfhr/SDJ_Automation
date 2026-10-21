# ADR 0007 — Perbaikan otomatis aturan input tracker

Tanggal: 18 Oktober 2026. Status: diterapkan dan dideploy atas permintaan pemilik pada release `20261018T160448Z`. Bukti deployment ada di [IMPLEMENTATION_STATUS](../IMPLEMENTATION_STATUS.md).

## Masalah dan keputusan

Pembaruan: [ADR 0008](0008-legacy-boolean-numeric-inputs.md) menggantikan penolakan TRUE/FALSE pada aktivitas angka di bawah dengan backup pada catatan sel dan pengosongan otomatis atas permintaan eksplisit pemilik.

Tracker peserta dapat mempunyai aturan checkbox pada aktivitas angka, misalnya Tilawah di J15. Pemilik meminta agar sistem membetulkan aturan tersebut secara otomatis. Keputusan ini menggantikan batas ADR 0006 yang melarang perubahan validasi file selama onboarding.

Tombol **Validasi & perbaiki** menjelaskan sebelum ditekan bahwa aturan yang tidak cocok akan diganti. Persetujuan ini terpisah dari izin pemrosesan AI. Backend hanya memeriksa tab pilihan, 15 baris aktivitas yang dikenali, dan kolom yang mempunyai header tanggal tervalidasi. Struktur ambigu tetap ditolak. Angka, checkbox, pilihan angka/rentang, serta formula validasi yang masih kompatibel dipertahankan.

Pemeriksaan mencakup seluruh tanggal yang dikenali, bukan satu tanggal contoh. Lima belas rentang baris membatasi pembacaan input hingga 30.000 sel pada batas 2.000 kolom yang sudah ada. Sebelum write apa pun, seluruh input harus bebas formula/merge/proteksi yang menghalangi edit dan berisi blank atau nilai sesuai domain. TRUE maupun FALSE pada Tilawah tidak dianggap blank, nol, satu, atau jumlah halaman: nilai tersebut dipertahankan, alamat sel disebutkan, dan peserta diminta memperbaiki isi terlebih dahulu. Nilai lama lain yang tidak sesuai juga tidak dikonversi.

Aturan yang tidak didukung atau tidak mempunyai nilai kompatibel, checkbox khusus, serta checkbox yang hilang pada aktivitas boolean diganti dengan aturan katalog: skor salat dropdown 0–3, rawatib angka bulat nonnegatif, Tilawah angka 0–100 termasuk pecahan, aktivitas boolean checkbox TRUE/FALSE standar. Sel angka tanpa aturan tetap diterima. Batas domain aplikasi selalu berlaku meskipun aturan sheet lebih longgar.

## Write dan verifikasi

Satu `spreadsheets.batchUpdate` hanya berisi `setDataValidation`, tanpa `updateCells`, nilai, format visual, target, bobot, label, atau rumus. Rentang dibatasi sel yang ditemukan; sel bersebelahan dengan aturan identik digabung tanpa melewati kolom di luar kalender. Formula validasi rawatib dikirim per sel agar referensinya tepat. Payload dibatasi 1,9 MB sebelum dikirim. Deadline keseluruhan tetap 20 detik dan tiap request maksimum 8 detik.

Setelah Google menerima batch, seluruh input dibaca ulang. Aturan yang diperbaiki harus mempunyai kondisi/batas dan strict yang diharapkan; aturan lain dan nilai juga diperiksa kembali. Koneksi belum dianggap lolos jika write ditolak, timeout, pembacaan ulang gagal, atau masih ada aturan yang perlu diperbaiki. Sistem tidak mengulang write otomatis; tombol validasi dapat dipakai lagi untuk memeriksa keadaan sebenarnya dan membangun rencana baru. Pengulangan pada file yang sudah benar tidak mengirim write.

`TrackerGateway.validate` kini merupakan tindakan onboarding yang dapat menulis aturan; jangan dipakai sebagai probe read-only pada file nyata. `inspect`, rekap, dan penulisan aktivitas biasa tetap memvalidasi tanpa memperbaiki aturan otomatis. Perubahan struktur tetap memerlukan validasi ulang. Tidak ada transaksi/compare-and-swap dengan editor manusia; peserta sebaiknya menyelesaikan edit struktur sebelum menghubungkan tracker.

## Hasil dan batas

Ringkasan browser dan DM menyebut jumlah sel yang diperbaiki melalui field opsional `configuration.repairedValidationCells`, tanpa isi aktivitas. Challenge DM asal tetap diperlukan untuk aktivasi. Perbaikan aturan sudah berlaku sebelum challenge dan tidak dibatalkan oleh pembatalan onboarding atau undo pencatatan; hal ini dijelaskan pada halaman dan ketentuan penggunaan. Tidak ada migrasi, penambahan scope Google, atau pengiriman data sheet ke AI. Tidak menyimpan salinan aturan lama; pengembalian aturan dilakukan melalui pengelolaan spreadsheet, bukan undo bot.

Fixture seluruhnya sintetis mencakup salah tipe, aturan asing/tidak kompatibel, checkbox hilang, semua tanggal, struktur adaptif, blok API ber-offset, 701 tanggal, batas nilai, preservasi catatan/format/rumus, proteksi/merge, hasil tidak pasti, verifikasi, dan pengulangan tanpa write. Pemeriksaan lokal tidak membuktikan keberhasilan pada spreadsheet teman atau deployment publik.

Rujukan API: [SetDataValidationRequest](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#SetDataValidationRequest).
