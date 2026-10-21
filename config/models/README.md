# Model dan routing AI

Kontrak aktif dijelaskan pada [ADR 0012](../../docs/adr/0012-conversation-and-reminders.md). Parser dan pending sederhana ditangani tanpa model. Prioritas target sehat: Groq, Gemini, OpenRouter, NVIDIA; maksimal dua percobaan, enam detik per percobaan, deadline luar 12 detik. Reservasi, kuota dan cooldown tetap bersama di PostgreSQL. Endpoint/model/credential tetap dari konfigurasi backend; tidak ada retry interpretasi pada gateway.

OpenRouter tetap dibatasi router/model gratis dan harga prompt/completion nol, `data_collection: deny`, serta consent provider v2. Consent onboarding baru dan DM konsisten; persetujuan lama tidak diperluas otomatis. Detail layanan berada pada halaman privasi.

Batas output tetap 4096 untuk Groq dengan reasoning low dan 2048 untuk provider lain. Template balasan/reminder tidak memakai AI. Usage total dan durasi percobaan dicatat jika tersedia; token NULL bukan nol.

`pnpm eval:ai` menampilkan dataset tanpa API. `pnpm eval:ai --conversation --live --provider=groq --limit=17` menguji parser lalu model pada 17 kasus percakapan sintetis. Gunakan `--model-only` untuk adapter saja dan `--retry-failed` untuk mengulang kasus gagal secara eksplisit. Report memakai fingerprint prompt, mode, model dan resume. Kesetaraan dinilai melalui efek domain, bukan hanya ejaan tanggal JSON. Dataset dasar 100 kasus tetap tersedia; 17 kasus percakapan atau satu smoke bukan kelulusan seluruh provider/100 kasus.

Batas kuota lokal konservatif tidak mengubah paket provider. Evaluasi live harus opt-in; hanya fixture sintetis, tanpa Google Sheets atau WhatsApp peserta.
