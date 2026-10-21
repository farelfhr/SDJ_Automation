# ADR 0010 — OpenRouter gratis dan pemulihan fallback AI

Tanggal: 19 Oktober 2026. Status: aktif pada release VPS `20261019T062833Z` pukul 13.29 WIB. Pemilik secara eksplisit meminta key yang diberikannya diterapkan pada konfigurasi rahasia dan routing produksi.

## Perilaku

OpenRouter menjadi target keempat pada router bersama Groq, Gemini, dan NVIDIA. Endpoint diikat ke `https://openrouter.ai/api/v1`, credential hanya dari environment backend. Default model `openrouter/free`; hanya router tersebut atau ID tunggal berakhiran `:free` diterima. Model berbayar, auto router berbayar, dan kombinasi ID ditolak sebelum request. Request membawa schema JSON strict, `require_parameters: true`, `data_collection: deny`, dan batas harga prompt/completion nol. Tidak menambahkan tool, plugin berbayar, identitas kanal, token Google, atau credential database. Model gratis aktual dapat berubah mengikuti pilihan OpenRouter; domain dan schema hasil tetap diperiksa backend.

Registry baru memakai bucket bersama `openrouter-default`, batas lokal 5 request/menit dan 50/hari. Ini batas aplikasi, bukan penambahan kuota provider. Pemeriksaan key melalui endpoint resmi saat implementasi melaporkan free tier, penggunaan biaya nol dan 50 request gratis tersisa. Kuota berikutnya mengikuti status akun/provider yang sebenarnya; tidak ada loop tanpa batas atau penggandaan kuota melalui API key.

Maksimum empat panggilan interpretasi dan anggaran total 30 detik, termasuk pemilihan target. Per-provider 8 detik; OpenRouter 12 detik, tetap dipotong sisa anggaran. Pemilihan awal mengikuti cursor bersama; fallback hanya menawarkan target yang belum dicoba. Shared quota/cooldown tetap berada di PostgreSQL. Tidak mengklaim urutan rotasi yang tetap setelah kegagalan, atau ketersediaan tanpa batas pada provider gratis. Anggaran interpretasi berada di bawah lease worker 60 detik; side effect tetap memakai journal dan readback asal, tanpa replay akibat pergantian model.

HTTP 400 `json_validate_failed`/`json_validation_failed` menjadi `invalid_output` dengan jeda sementara, bukan konfigurasi yang menonaktifkan bucket. Output yang terpotong atau envelope error HTTP 200 tidak dianggap sukses. Timeout dibedakan dari transport `network`. Kredit/budget OpenRouter mendapat kategori `credits`; pembatasan mengikuti Retry-After. Autentikasi/konfigurasi definitif tetap memerlukan koreksi operator. Penolakan safety dan nilai domain tidak dicoba ulang untuk memperoleh jawaban yang mengizinkan. Groq memakai `reasoning_effort: low` serta batas output 4.096 untuk mengurangi risiko output JSON kehabisan ruang; perubahan diuji memakai satu pesan sintetis, bukan klaim kelulusan evaluasi seluruh model.

Parser menerima pemisah baris, variasi `putuskan koneksi`, dan `lihat/cek status hari ini` sebagai rekap harian. `status` tanpa tanggal tetap status koneksi. Perintah putus tetap memerlukan konfirmasi. Saat semua AI gagal, balasan memberi alternatif perintah langsung yang tidak membutuhkan model.

## Persetujuan dan database

Izin lama `free-providers-v1` menyebut tiga provider asal. Tidak mengubah persetujuan peserta secara massal. Pada bahasa bebas pertama, peserta memberikan pembaruan melalui DM yang menyebut OpenRouter beserta penyedia model gratis yang dipilihnya. Jawaban persetujuan menyimpan `free-providers-v2` dan melanjutkan pesan tertunda sekali melalui alur asal. Perintah langsung tetap tersedia tanpa persetujuan baru. Onboarding Google tetap memberi izin v1 untuk provider yang disebut di halaman; tambahan provider dimintakan melalui DM sehingga tab browser lama pun tidak dianggap menyetujui layanan baru secara diam-diam.

Migrasi `20261019062439_openrouter_free_fallback.sql` memperluas CHECK provider, membuat target OpenRouter dalam keadaan disabled untuk staging, serta menambahkan pemeriksaan consent v2 pada reservasi SQL. Owner, grant, RLS, kontrol actor dan shared quota fungsi dipertahankan. Key tidak dimasukkan SQL, tabel, paket release atau repositori. Tidak mengubah formula/nilai tracker atau sesi gateway.

## Bukti dan peluncuran

204 unit test, 30 E2E, typecheck, lint, format dan build diperiksa lokal. Uji mencakup endpoint/credential, pembatasan gratis, JSON error/recovery, timeout, envelope HTTP 200, fallback sampai target keempat, batas waktu total, consent lama dan parser tanpa AI. Uji transaksi sintetis pada database utama membuktikan consent v1 ditolak untuk OpenRouter, v2 diterima, serta izin AI yang dicabut ditolak; seluruh fixture dan perubahan cursor dibatalkan melalui ROLLBACK, tanpa job/delivery atau chat peserta.

Smoke live sintetis OpenRouter berhasil HTTP 200 dengan hasil domain benar, model `dots-studio/dots-3-note-preview:free`, sekitar 3,3 detik dan cost 0. Groq juga berhasil HTTP 200 sekitar 1,2 detik dengan pengaturan baru. Tidak memakai pesan peserta, menulis Sheets atau mengirim DM dalam smoke tersebut. Staging VPS wajib mengulang build/unit dan smoke OpenRouter sebelum aktivasi. Rollback mengembalikan symlink dan environment; migrasi aditif tetap kompatibel dengan kode sebelumnya yang tidak menawarkan OpenRouter.

Staging VPS mengulang build dan 204 unit test, memverifikasi patch WhatsApp, serta smoke dari modul hasil build: OpenRouter HTTP 200 dalam 9,15 detik, cost 0; Groq HTTP 200 dalam 1,00 detik. Setelah aktivasi, OpenRouter enabled dan bucket Groq dipulihkan setelah smoke berhasil. API/worker/proxy/gateway/Caddy aktif, API/gateway ready, NRestarts nol. Gateway tetap berjalan sejak 18 Oktober 19.25 WIB tanpa restart. HTTPS halaman/aset 200, sesi tidak sah ditolak dan rute internal 404; privacy menyebut provider baru. Release sebelumnya `20261018T233308Z` serta environment sebelumnya dipertahankan untuk rollback. Tidak menjalankan onboarding/DM peserta untuk verifikasi ini; peserta memperbarui persetujuan sendiri pada pesan bahasa bebas berikutnya.

Rujukan: [Free router](https://openrouter.ai/openrouter/free), [limits dan pemeriksaan key](https://openrouter.ai/docs/api_reference/limits), [provider selection](https://openrouter.ai/docs/guides/routing/provider-selection), [Groq structured outputs](https://console.groq.com/docs/structured-outputs).
