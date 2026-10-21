# ADR 0004: konteks rekap dan validasi tanggal output AI

Tanggal: 16 Oktober 2026. Status: perbaikan laporan percakapan setelah rekap bulanan.

Metadata percobaan provider pada peserta pengujian menunjukkan izin AI aktif, rekap berhasil, lalu satu timeout dan dua output invalid. Probe sintetis mereproduksi output pencatatan dengan skor lengkap tetapi `items[].date_reference=null` untuk pesan yang secara jelas menyebut hari ini. Instruksi prompt tingkat atas tentang tanggal null sebelumnya dapat tertukar dengan tanggal pada tiap item. Batas lokal satu request per menit per provider juga berarti percobaan ulang segera dapat tertahan setelah semua target digunakan; ini batas konservatif aplikasi, bukan bukti kuota provider habis.

Prompt kini menjelaskan perbedaan field tingkat atas dan tanggal per item disertai contoh. Output pencatatan yang memiliki slot null diperlakukan sebagai klarifikasi, bukan diberi nilai/tanggal tebakan atau dianggap outage. Jawaban tanggal sederhana pada pending slot dapat diproses tanpa model. Persyaratan tanggal eksplisit untuk pesan terlambat tetap berlaku. Pesan gangguan aktual membedakan masa jeda tanpa reservation dari panggilan yang gagal dan tidak mengarahkan peserta menghubungkan ulang atau menyetujui ulang.

Parser lokal menerima awalan pencatatan yang jelas seperti “tolong isi hari ini, subuh 3, ...”, menerapkan tanggal bersama, dan tetap memvalidasi seluruh batch. Negasi, item asing, dan teks yang tidak tercakup dikembalikan ke interpreter; tidak ada penulisan sebagian. Persetujuan tunggal “setuju” masuk pemeriksaan pending backend tanpa membutuhkan provider.

Permintaan format rekap memakai intent `format_summary`. Backend menyimpan hanya jenis/periode rekap dalam `commands.intent_ciphertext` dengan AAD per user/command, lalu memilih konteks identity yang sama selama 30 menit. Data tracker dibaca ulang ketika merapikan; isi rekap lama tidak dikirim ke AI. Kompatibilitas rekap sebelum pembaruan mengambil periode dari header balasan bot terenkripsi milik identity tersebut saja. Tidak ada konteks lintas peserta atau riwayat global.

Rekap bulanan memiliki judul, bagian Salat, Rawatib & tilawah, dan Kebiasaan dengan bullet WhatsApp. Checkbox dilaporkan sebagai hari dicentang; false bawaan spreadsheet tidak diklaim sebagai hari pelaporan yang dikonfirmasi. Tidak ada pengubahan isian atau replay otomatis terhadap pesan lama yang ditolak. Batas provider, biaya, role, dan schema tidak diubah.
