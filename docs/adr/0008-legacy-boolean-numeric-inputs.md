# ADR 0008 — Koreksi otomatis TRUE/FALSE pada input angka

Tanggal: 18 Oktober 2026. Status: diterapkan dan dideploy pada release `20261018T161906Z` atas permintaan eksplisit pemilik. Bukti ada di [IMPLEMENTATION_STATUS](../IMPLEMENTATION_STATUS.md).

## Keputusan

Pembaruan 19 Oktober: [ADR 0009](0009-complete-tracker-normalization.md) mengganti lingkup parsial dan backup note di bawah dengan normalisasi semua tipe input serta rekam pemulihan pada tab tersembunyi. Keputusan di bawah merupakan riwayat release sebelumnya.

Pemilik menegaskan bahwa TRUE/FALSE yang sudah menjadi isi Tilawah juga harus diperbaiki tanpa koreksi manual dan tanpa menghalangi validasi. Ini menggantikan penolakan boolean lama dalam [ADR 0007](0007-automatic-input-validation-repair.md).

Pada onboarding, boolean native TRUE maupun FALSE di sel aktivitas angka yang dikenali (skor salat, rawatib, Tilawah) dikosongkan menjadi **belum diisi**. Tidak dikonversi menjadi 0, 1, atau jumlah halaman. Aturan sel diganti sesuai katalog. Angka valid termasuk 0 dan pecahan Tilawah dipertahankan; FALSE pada aktivitas boolean tetap FALSE. Formula, merge, proteksi, struktur ambigu, teks dan angka di luar domain tetap memblokir sebelum write apa pun. Teks literal "TRUE"/"FALSE" bukan boolean native dan belum dikonversi.

Halaman tombol **Validasi & perbaiki** dan ketentuan penggunaan memberitahukan pengosongan otomatis ini sebelum pengguna melanjutkan. Browser dan DM melaporkan jumlah sel melalui field opsional `configuration.resetInputCells`, lalu meminta pengguna mencatat jumlah sebenarnya setelah terhubung. Challenge DM tetap diperlukan. Pembatalan onboarding/undo bot tidak mengembalikan perbaikan onboarding.

## Pemulihan dan penulisan

Sebelum menghapus nilai, backend menyimpan catatan asal TRUE/FALSE pada **note sel yang sama**, dengan mempertahankan note sebelumnya. Ini menjadi rekam pemulihan yang persisten di file peserta sebelum perubahan nilai dikirim. Note tidak dikirim ke AI, tidak dimasukkan log atau database, dan tidak disalin ke file lain. Note dibatasi 20.000 karakter; payload batch dibatasi 1,9 MB sebelum perubahan dikirim. Marker yang sama tidak digandakan saat retry.

Urutan: periksa semua input; baca ulang boolean/note/proteksi; kirim backup note dengan field mask `note`; baca ulang dan pastikan nilai masih sama serta backup tersimpan; kirim satu batch aturan dan pengosongan terarah dengan `repeatCell` serta field mask `userEnteredValue`; baca ulang untuk memastikan aturan standar, sel kosong, dan note asal tetap ada. Nilai, note, formula atau proteksi yang berubah sebelum pengosongan membatalkan proses, tanpa menimpa nilai baru. Sel angka valid di antara sel boolean tidak dilalui rentang pengosongan.

Rekam note sebelum clear merupakan pengecualian alur pemulihan onboarding ini; journal mutation aplikasi dan undo percakapan tetap digunakan untuk pencatatan harian biasa. Tidak ada migrasi database atau perubahan scope Google. Sheets tidak menyediakan compare-and-swap terhadap editor manusia: pembacaan ulang mempersempit, tetapi tidak menghapus race setelah pemeriksaan terakhir. Hindari mengedit tracker saat validasi berjalan.

Timeout/hasil belum pasti tidak mengaktifkan tracker atau memicu clear ulang otomatis. Validasi ulang membaca kondisi sebenarnya: bila backup sudah tersimpan, note tidak digandakan; bila clear sudah diterapkan, tidak ada clear kedua. Jika backup belum dapat diverifikasi, nilai tidak dikosongkan.

## Verifikasi

Fixture sintetis menguji kedua boolean, backup note yang sudah ada, angka 0/pecahan, checkbox aktivitas boolean, beberapa tanggal dan blok API ber-offset, gagal menyimpan backup/gagal clear, perubahan bersamaan menjadi angka, timeout sesudah backup/clear, retry, formula, merge, proteksi, dan preflight nilai tidak valid. Hasil deployment dicatat di IMPLEMENTATION_STATUS; tes sintetis tidak membuktikan keadaan file teman.

Rujukan: [RepeatCellRequest](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#RepeatCellRequest), [CellData.note](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells#CellData).
