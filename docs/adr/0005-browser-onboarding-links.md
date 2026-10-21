# ADR 0005: tautan onboarding aman untuk pratinjau dan pembukaan ulang

Tanggal: 18 Oktober 2026. Status: implementasi untuk laporan tautan peserta sudah dipakai ketika dibuka.

Sebelumnya GET `/connect?token=...` langsung menukar token ke cookie. Pratinjau/prefetch dapat mengikat token tanpa peserta melanjutkan login. Membuka kembali tautan yang sama juga selalu mencoba exchange baru, walaupun cookie browser asli masih valid. Permintaan `daftar` baru tetap membatalkan sesi sebelumnya, sehingga peserta yang mendapat beberapa balasan berdekatan harus memakai tautan terakhir. Metadata peserta yang diperiksa memperlihatkan dua sesi cancelled dan satu browser_bound tanpa koneksi Google; metadata itu tidak membuktikan browser/pratinjau mana yang mengikat token.

GET/HEAD tautan kini hanya menampilkan halaman awal tanpa query database, cookie, atau perubahan sesi. JavaScript juga tidak menukar token pada load. Peserta menekan **Lanjutkan** untuk memanggil POST `/connect/exchange` JSON dengan pemeriksaan Origin tepat sesuai PUBLIC_BASE_URL dan custom header. Halaman tidak memuat token dalam HTML; URL diganti sesudah exchange berhasil. Proxy publik hanya mengizinkan method/path yang sesuai.

Token tetap hanya dapat mengikat satu browser. Browser asli dapat melanjutkan sesi selama cookie, hash token tautan, status aktif, dan expiry cocok dalam UPDATE tenant yang sama. CSRF diperbarui; browser cookie dan status OAuth/PKCE tidak diganti. Cookie saja tidak bisa melanjutkan tautan milik sesi lain; token terpakai tanpa cookie yang benar tetap ditolak. Batas sepuluh menit tidak diperpanjang. State OAuth tetap sekali pakai dan challenge aktivasi tetap harus dibalas dari DM asal.

Sesi kedaluwarsa pada halaman browser menampilkan panduan meminta tautan terbaru, bukan JSON mentah. API tetap memberikan error terstruktur agar UI dapat menampilkannya. Tidak mengubah schema, role, RLS, credential, atau pilihan tracker. Sesi lama yang sudah kedaluwarsa tidak diaktifkan ulang.

Regresi mencakup GET/HEAD berulang tanpa exchange, script load tanpa request, klik ganda, Origin salah, cookie aman, recovery HTML, dan routing proxy. Integration database utama menguji resume cookie yang tepat sebelum/selama OAuth, penolakan cookie salah/peserta lain, CSRF lama tidak berlaku, dan sesi selesai tidak dapat dipakai ulang. Google/Sheets pada integration tetap sintetis.
