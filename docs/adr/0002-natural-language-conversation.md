# ADR 0002: instruksi bahasa sehari-hari

Tanggal: 15 Oktober 2026. Status: implementasi sesuai permintaan pengguna agar peserta tidak terikat format khusus.

Seluruh jenis tindakan SDJ dapat diusulkan melalui interpreter AI: pencatatan/koreksi absolut, rekap, bantuan, status, penghubungan, undo, putus koneksi, penghapusan akun, serta konfirmasi/pembatalan permintaan aktif. Parser tetap menangani bentuk sederhana dan percakapan awal sebelum consent tanpa memanggil provider. Kemampuan ini memperluas cara menyampaikan instruksi; batas fitur, satuan, maksimal lima item, dan izin peserta tetap berlaku.

Interpreter menerima pesan dan konteks minimal berupa tanggal lokal penerimaan serta satu pertanyaan aktif milik identity yang sama. Tidak ada riwayat chat global, credential, identitas, atau target spreadsheet pada prompt. Pending memiliki TTL sepuluh menit. Flag `continues_pending` hanya diizinkan pada pencatatan/klarifikasi dan diperiksa backend: slot yang sudah jelas tidak dapat diganti diam-diam, seluruh item harus tetap ada, dan tanggal awal dibekukan melewati tengah malam. Jawaban penentuan tanggal untuk pesan terlambat harus menghasilkan tanggal eksplisit.

Interpreter memahami angka dalam kata, ungkapan santai, dan tanggal relatif satu sampai 31 hari lampau. Skor salat tidak disimpulkan dari keterangan sudah salat. Jika sebagian batch kurang jelas, backend bertanya per slot dan menunggu seluruh batch lengkap sebelum menulis. Permintaan yang belum didukung tidak dijalankan sebagian.

Putus koneksi/penghapusan tetap dua langkah. Persetujuan bahasa bebas harus mengacu pada pending milik peserta itu sendiri, mengandung kata persetujuan yang dikenali, dan tidak mengandung penolakan/keraguan/pertanyaan. Model tidak dapat melewati pemeriksaan ini. Undo tetap memakai journal, syarat nilai terkini, dan TTL yang sudah berlaku.

Kontrak tambahan disimpan dalam payload JSON terenkripsi yang sudah tersedia; tidak ada perubahan schema atau migrasi database. Dataset `sdj-conversation-v2` melengkapi baseline 100 kasus. Kelulusan tes dengan interpreter sintetis tidak menggantikan evaluasi provider nyata; hasil live dicatat di dokumen status.
