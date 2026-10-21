# ADR 0006 — Konfigurasi tracker adaptif

Tanggal: 18 Oktober 2026. Status: diterapkan atas permintaan pemilik.

Pembaruan berikutnya: [ADR 0007](0007-automatic-input-validation-repair.md) mengizinkan perbaikan otomatis aturan input saat onboarding atas permintaan pemilik. Larangan perubahan validasi dan pemeriksaan satu tanggal contoh di bawah merupakan keputusan sebelum pembaruan tersebut.

## Masalah

Salinan template SDJ dapat mempunyai letak label, urutan aktivitas, header tanggal, dan aturan validasi berbeda. Foto label aktivitas yang sama belum membuktikan kesamaan validasi pada sel input. File peserta yang dilaporkan belum diperiksa karena tautannya tidak diberikan.

## Keputusan

Adapter membaca struktur terlebih dahulu. Jalur acuan mempertahankan algoritme fingerprint lama agar koneksi aktif dan journal sebelumnya tetap kompatibel. Bila acuan tidak cocok, adapter mencari satu kolom lengkap berisi 15 aktivitas yang dikenal serta satu header tanggal lengkap di atasnya. Pemetaan memakai label/alias domain yang disetujui; tidak mengirim isi sheet ke AI.

Analisis dibatasi pada 100 baris pertama dan 12 kolom label pertama; header pada 24 baris pertama, maksimum 2.000 kolom atau 48.000 sel header. Tanggal adaptif berupa serial berformat DATE/DATE_TIME atau teks ISO YYYY-MM-DD. Angka hari 1–31 tidak ditebak sebagai tanggal. Header/label ambigu ditolak. Pembacaan diberi deadline 20 detik dengan setiap request maksimum 8 detik dan pemeriksaan sisa waktu setelah pengambilan token.

Aturan angka mendukung perbandingan NUMBER_*, pilihan angka literal, serta ONE_OF_RANGE/named range pada file yang sama (maksimum 100 sel per referensi dan delapan referensi berbeda per pemeriksaan). CUSTOM_FORMULA hanya untuk aturan sederhana pada sel yang sama: ISNUMBER, perbandingan konstanta, AND/OR, serta integer INT atau MOD. Formula lain tetap ditolak. Checkbox harus TRUE/FALSE standar; nilai khusus tidak diartikan otomatis.

Domain SDJ tetap berlaku: skor salat 0–3, rawatib integer nonnegatif, tilawah 0–100, dan boolean sesuai katalog. Adapter memeriksa kecocokan aturan, formula, merged cell, serta proteksi. Pemeriksaan awal membaca satu tanggal contoh; sel yang benar-benar dituju diperiksa ulang sebelum write. Aturan pada tanggal lain tidak dianggap sudah lolos hanya karena onboarding berhasil.

## Aktivasi dan penyimpanan

Halaman dan DM menampilkan jumlah aktivitas serta rentang tanggal yang dikenali sebelum aktivasi. Challenge pada DM asal tetap wajib. Binding baris dan hash label aktual disimpan pada tabel yang ada; fingerprint adaptif mencakup versi, kolom label, baris header, label, dan pemetaan tanggal. Tidak diperlukan migrasi atau credential tambahan.

Auto-config mengubah konfigurasi aplikasi, bukan isi, validasi, rumus, atau format file peserta. Perubahan struktur setelah aktivasi tetap meminta validasi ulang. Blank, nol, dan false tetap berbeda.

## Batas dan verifikasi

Aktivitas asing/tidak lengkap, tracker terbalik baris-kolom, beberapa kalender ambigu, tanggal lokal tanpa konteks, checkbox khusus, formula arbitrer, dan referensi eksternal belum didukung. Pesan kegagalan menyebut aktivitas, alamat sel dan tipe aturan.

Fixture sintetis menguji fingerprint lama, pergeseran struktur, urutan baris, tanggal native/ISO, penolakan nominal uang sebagai tanggal, ambiguitas, pilihan rentang, formula sederhana, domain nilai, dan tidak adanya write selama analisis. Integration terpilih memeriksa penyimpanan binding dan konfirmasi DM pada Supabase utama dengan data sintetis. Hasil live/deployment dicatat di IMPLEMENTATION_STATUS.
