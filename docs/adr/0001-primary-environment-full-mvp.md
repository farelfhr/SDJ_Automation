# ADR 0001: lingkup implementasi dan environment utama

Tanggal: 15 Oktober 2026. Status: mengikuti persetujuan eksplisit pemilik proyek pada percakapan implementasi.

Dokumen desain v1 menyebut lima salat, AI opsional, database disposable, dan tidak memakai Supabase. Keputusan pengguna memperluas dan mengganti ketentuan tersebut. Detail di bawah menjadi rujukan implementasi v2.

- Supabase project utama menjadi PostgreSQL untuk runtime dan integration tests. Semua proses membaca `.env` utama. Tidak ada database/container test tambahan. Integration tests membuat peserta, sheet adapter, dan target kuota sintetis dengan prefix unik; menguji RLS menggunakan role runtime sebenarnya, lalu membersihkan baris miliknya.
- Aktifkan 15 aktivitas. Lima salat memakai integer 0–3, rawatib integer ≥0 dalam kali pelaksanaan, tilawah 0–100 halaman dengan desimal, dan delapan aktivitas lain memakai checkbox boolean. Murojaah diputuskan boolean meskipun label template lama mencantumkan halaman. Infaq adalah pelaksanaan, bukan nominal uang.
- Satu pesan maksimal lima item. Semua nilai dan struktur divalidasi sebelum journal/write. Hanya set absolut; increment belum didukung. Undo mencakup seluruh kelompok, TTL 10 menit, dan mempertahankan blank/0/false.
- Parser deterministik tidak memanggil AI. Pemahaman bahasa bebas merupakan fitur MVP dan memerlukan persetujuan peserta. Ring provider Groq → Gemini → NVIDIA → Groq berlaku antar pesan; target disabled/cooldown dilewati. Maksimal tiga panggilan, empat detik per panggilan, dua belas detik total. GLM key yang diberikan adalah NVIDIA API Catalog.
- Backend memakai role `sdj_app`, `sdj_ingress`, `sdj_scheduler`, dan pemeliharaan terpisah `sdj_maintenance`; tidak memakai owner/service_role untuk request bisnis. `sdj` adalah schema privat dengan FORCE RLS. Session pooler port 5432 diperlukan untuk advisory lock.
- Ingress memakai signed HTTP, timestamp, nonce, dan account scope. Google OAuth menggunakan PKCE/state sekali pakai, browser session+CSRF, Picker `drive.file`, serta challenge pada DM asal. `/connect/google/start` adalah POST dengan CSRF.
- Retensi default: teks pesan terminal tujuh hari; payload journal/delivery terminal tiga puluh hari; unresolved mutation ditahan untuk pemeriksaan. Penghapusan akun menunggu operasi dan delivery yang aktif lalu membuat tombstone.

Runtime utama di komputer ini tidak sama dengan bukti kelulusan pilot. G0, login Google nyata, dua identitas WhatsApp, readback tracker nyata, restore backup, dan evaluasi model lengkap tetap memerlukan bukti. Hasil aktual dicatat pada `IMPLEMENTATION_STATUS.md`.
