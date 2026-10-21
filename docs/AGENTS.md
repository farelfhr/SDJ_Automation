> Implementasi v2: keputusan pengguna pada [ADR 0001](adr/0001-primary-environment-full-mvp.md) menggantikan lingkup v1 yang menyebut lima aktivitas, dua provider, database disposable, atau larangan Supabase. Runtime dan integration tests memakai .env serta Supabase utama. Bukti aktual ada di [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

# AGENTS.md

Instruksi repository untuk Codex, Claude Code, dan coding agent lain. Versi 1.0.0, 15 Oktober 2026. Dokumen ini menjelaskan cara bekerja pada produk, bukan konfigurasi runtime OpenClaw dan bukan system prompt bot peserta.

## 1. Baca sebelum mengubah kode

1. [README.md](README.md): status repository dan titik mulai.
2. [PRD.md](PRD.md): masalah, lingkup, perilaku pengguna, release gate.
3. [ARCHITECTURE.md](ARCHITECTURE.md): batas kepercayaan dan keputusan teknis.
4. [SCHEMA.md](SCHEMA.md): kontrak data, ownership, status, dan invariants.
5. Dokumen ADR/runbook yang terkait jika sudah ada.

Jangan membaca seluruh repository secara membabi buta. Gunakan `rg` untuk menemukan implementasi yang relevan. Identifikasi apakah direktori dan command yang disebut dokumen sudah tersedia atau masih rencana. Pada paket awal ini belum ada codebase aplikasi, migration, package.json, atau hasil tes produk.

Bahasa dokumentasi dan pesan pengguna adalah Bahasa Indonesia. Identifier kode, nama tabel, dan kode error menggunakan English yang konsisten. Gunakan istilah sederhana dan hindari klaim keberhasilan yang belum diuji.

## 2. Model produk yang harus dipertahankan

- Satu bot melayani banyak peserta. Setiap peserta menghubungkan satu tracker pribadi pada MVP.
- Peserta lain tidak dapat dipilih melalui isi pesan. Actor berasal dari metadata kanal yang diautentikasi.
- Spreadsheet menjadi sumber nilai harian. Database menyimpan koneksi, journal, jobs, dan konfigurasi.
- Parser biasa menangani perintah jelas tanpa AI. Gemini/Groq hanya menginterpretasikan bahasa bebas.
- Backend memegang routing model, otorisasi, resolusi tanggal, dan write. Model tidak memegang credential atau range.
- OpenClaw adalah adapter kanal operator yang harus lolos spike G0. Shared gateway atau prompt sesi bukan batas isolasi tenant.
- Fallback interpretasi tidak boleh mengulang mutation yang sudah dikirim.
- MVP mengaktifkan lima salat dengan set integer 0–3. Aktivitas lain dan increment tidak aktif sampai kontraknya disahkan.

## 3. Prioritas ketika spesifikasi bertentangan

Instruksi pengguna terbaru yang eksplisit menentukan tujuan. Untuk detail desain, PRD menentukan perilaku produk, SCHEMA menentukan nama/tipe/status kontrak, ARCHITECTURE menentukan batas komponen, dan file ini menentukan proses kerja. Jika perubahan membuat kontrak berbeda, perbarui dokumen terkait dalam perubahan yang sama dan catat alasannya pada ADR.

Jangan menyelesaikan konflik keamanan/ownership dengan asumsi longgar. Lanjutkan bagian independen menggunakan fake adapter sambil menyebut blocker spesifik. Jangan meminta persetujuan ulang untuk pekerjaan lokal reversibel yang sudah diminta. Jangan membuat akun, mengirim pesan nyata, mengubah tracker asli, atau mengaktifkan pengeluaran tanpa otorisasi yang sesuai.

Jangan menggunakan subagent hanya karena file ini bernama AGENTS.md. Delegasi mengikuti instruksi pengguna dan lingkungan yang berlaku.

## 4. Invariants yang tidak boleh dilanggar

### Actor dan tenant

1. Jangan menerima `user_id`, Google connection, tracker, atau spreadsheet target dari output model.
2. Jangan mempercayai sender yang diketik dalam body chat atau parameter tool model.
3. Setiap repository tenant menerima ActorContext dan menggunakan tenant transaction yang sama. Query yang tidak menyebut user tetap harus terlindungi RLS.
4. FK lintas tabel peserta menyertakan user_id. Jangan mengganti composite FK dengan pengecekan UI saja.
5. Jangan memakai role owner/superuser/BYPASSRLS sebagai runtime aplikasi.
6. History, cache, pending clarification, dan response routing dipisahkan per identity/user. Jangan memakai singleton chat history.

### Google dan spreadsheet

7. OAuth/Picker memerlukan izin Google yang sah. Jangan mengubah file `.xlsx` seolah native Google Sheets.
8. Token terenkripsi di backend, tidak pada prompt atau workspace OpenClaw.
9. Sel target diselesaikan dari binding dan header tanggal yang tervalidasi. Jangan hardcode `CG10` atau hari-ke-n sebagai implementasi umum.
10. Jangan menimpa formula rekap, target, bobot, atau summary cells. Baca formula marker, struktur, dan nilai sebelum menulis. Pengecualian yang disetujui pemilik pada [ADR 0009](adr/0009-complete-tracker-normalization.md): rumus tepat di sel input harian boleh dinormalisasi saat onboarding setelah rekam pemulihan persisten diverifikasi; bukan izin menimpa rumus di luar wilayah input atau saat rekap/pencatatan biasa.
11. Blank, angka 0, dan boolean false berbeda. Jangan mengubah salah satunya menjadi yang lain secara diam-diam.
12. Penulisan bertipe dengan RAW, bukan formula/string hasil user yang dievaluasi spreadsheet.

### Retry, journal, dan balasan

13. Simpan journal sebelum mengirim write. Status uncertain memblokir writer tracker berikutnya sampai rekonsiliasi.
14. Jangan mengklaim distributed exactly-once atau transaksi atomik PostgreSQL + Sheets.
15. Mutation timeout tidak memicu AI fallback atau read-modify-write ulang.
16. Delivery retry tidak menjalankan command kembali. Jangan kirim balasan sukses sebelum outcome terverifikasi.
17. Selalu bedakan no-op, applied, rejected, conflict, uncertain, dan delivery_unknown.
18. Undo adalah mutation baru dengan syarat current value, ownership, relasi, dan TTL.

### AI dan kuota

19. Router backend adalah pemilik tunggal retries/fallback untuk tugas SDJ. Jangan menumpuk retry SDK dan OpenClaw tanpa ADR.
20. Semua provider menghasilkan kontrak domain sama dan semantic validation yang sama.
21. Model ID, harga, quota, capability, dan API plugin harus diverifikasi pada sumber resmi/version terpasang. Jangan menebak nama konfigurasi.
22. Cooldown dan quota reservations dibagi antar worker sesuai bucket project/org sebenarnya, bukan sekadar key.
23. Provider berbayar dan provider baru dengan kebijakan data berbeda tidak aktif secara diam-diam.

### Privasi

24. Jangan commit `.env`, credential, token, sesi WhatsApp, dump tracker, nomor peserta, atau workbook asli.
25. Log operasional tidak memuat raw chat, nilai ibadah, OAuth callback params, token, atau full provider error body.
26. Seed dan fixture seluruhnya sintetis. Jangan menggunakan salinan workbook pribadi sebagai fixture meskipun namanya sudah diganti.
27. Tidak ada akses rutin operator untuk membaca tracker seluruh peserta. Jangan menambahkan dashboard tersebut sebagai bonus fitur.

## 5. Cara mengerjakan satu tugas

1. Tentukan milestone dan acceptance criteria yang relevan. Sebutkan asumsi yang berdampak pada perilaku.
2. Baca implementasi terdekat dan periksa git status sebelum mengedit. Pertahankan perubahan pengguna yang tidak terkait.
3. Kerjakan satu vertical slice kecil yang bisa ditunjukkan: request sintetis masuk, domain memutuskan, state disimpan, hasil dapat diperiksa.
4. Tambahkan meaningful tests untuk perilaku, bukan test yang hanya menyalin implementasi.
5. Jalankan pemeriksaan yang relevan. Jangan menyatakan command berhasil bila belum ada atau belum dijalankan.
6. Perbarui dokumentasi/setup jika perilaku, kontrak, dependency, atau command berubah.
7. Laporkan hasil konkret, pemeriksaan yang dijalankan, serta batas yang tersisa. Jangan menganggap fake integration sebagai live success.

Gunakan patch kecil, TypeScript strict, parameterized SQL, timeout eksplisit, typed errors, dependency injection untuk clock/random/adapters, dan schema strict pada setiap boundary. Hindari `any`, silent catch, `as` casting output eksternal tanpa validasi, dan retry tak terbatas.

## 6. Urutan implementasi awal

### G0: spike sebelum janji integrasi nyata

Verifikasi versi OpenClaw, ingress metadata tepercaya, event interception sebelum model, outbound DM, history/echo guard, session separation, dan cara menonaktifkan auto-reply default. Catat versi, sumber resmi, potongan konfigurasi yang benar-benar diuji, hasil uji, dan blockers pada `docs/spikes/openclaw-channel.md`.

Tidak boleh membuat API plugin fiktif agar contoh tampak berjalan. Jika G0 terhalang dependency/credential, lanjutkan M1 dengan fake channel. Jangan menyatakan G0 selesai.

### M1: core lokal tanpa layanan eksternal

- Bootstrap workspace dan scripts yang jelas.
- Domain TypedCellValue, alias/parser, date resolver, error codes.
- Migration tabel core, RLS, composite FK, message dedupe, jobs, mutation journal, delivery outbox.
- Fake channel, fake Sheets dengan kemampuan inject timeout/crash, deterministic clock.
- Satu skenario end-to-end lokal dua peserta: `zuhur, 3`, rekap, koreksi, undo, duplicate message.
- Tidak memerlukan API AI untuk menyelesaikan milestone ini.

### M2 sampai M5

Ikuti tabel milestone pada PRD. Jangan mengaktifkan AI sebelum pemisahan interpretasi dan side effect terbukti. Jangan membuka pilot sebelum multiuser isolation, OAuth, recovery, dan retensi diuji.

## 7. Struktur dan interface kode

Ikuti struktur target ARCHITECTURE. Domain tidak bergantung pada SDK, web framework, atau database driver. Buat interface sempit, misalnya:

```ts
interface IntentInterpreter {
  interpret(input: InterpretationInput): Promise<CommandProposal>;
}

interface TrackerGateway {
  inspectTarget(input: AuthorizedTarget): Promise<TargetSnapshot>;
  writeAbsolute(input: PreparedMutation): Promise<WriteReceipt>;
  readBack(input: PreparedMutation): Promise<TargetSnapshot>;
}
```

Nama interface adalah panduan internal, bukan SDK eksternal yang sudah ada. AuthorizedTarget/PreparedMutation dibuat use case setelah otorisasi dan journal, tidak langsung dari HTTP body/model. Expose side effect hanya lewat use case yang menjaga invariants.

Tidak memakai Supabase, Redis, ORM, Kubernetes, queue SaaS, atau agent framework tambahan tanpa kebutuhan yang dibuktikan dan ADR. Dependency baru dipilih untuk kebutuhan konkret, dicek pemeliharaan/kompatibilitasnya, dipin lockfile, dan dicatat bila memengaruhi setup.

## 8. Commands pengembangan yang ditargetkan

Daftar ini belum tersedia pada paket dokumen. Saat bootstrap, buat scripts yang benar-benar menjalankan tugas berikut atau dokumentasikan nama penggantinya.

| Command target | Tujuan |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install reproduktif setelah lockfile dibuat |
| `pnpm lint` | Style dan aturan kode |
| `pnpm typecheck` | TypeScript semua workspace |
| `pnpm test` | Unit/domain tests tanpa layanan live |
| `pnpm test:integration` | PostgreSQL disposable, role/RLS/queue/recovery |
| `pnpm test:e2e` | Fake dependency end-to-end dua peserta |
| `pnpm eval:ai` | Dataset versi tertentu, live provider opt-in eksplisit |
| `pnpm db:migrate` | Apply migration pada DB yang ditentukan |
| `pnpm dev` | API/worker lokal setelah setup |

Jangan membuat script yang hanya `echo success` atau exit 0 untuk memenuhi checklist. Test live harus opt-in, memakai credential test dan salinan tracker sintetis, serta tidak berjalan otomatis pada setiap unit test/CI.

## 9. Test yang paling penting

- Cross-tenant SELECT/UPDATE ditolak dengan role runtime, termasuk ketika WHERE user_id sengaja dihilangkan.
- Sender/body spoofing, link tracker orang lain, forwarded onboarding link, state replay, challenge salah.
- Alias, angka di luar rentang, tanggal invalid, tengah malam, pesan tertunda, pending clarification salah pengguna.
- ID pesan yang sama dua kali, ID sama body berbeda, dua worker berlomba.
- Google timeout setelah write berhasil, crash sebelum finalize, manual edit setelah prepare, formula/kolom bergeser.
- Undo berulang, undo expired, undo setelah manual edit, blank vs 0.
- AI malformed JSON, semantic invalid, 429, wrong credentials, circuit recovery, tiga attempts maksimal, semua provider gagal.
- Parser route menghasilkan nol panggilan model, termasuk saat AI dependency tidak dikonfigurasi.
- Disconnect dan account deletion tidak memicu write baru atau menghapus bukti unresolved mutation.

## 10. Checkpoint dan handoff

Setelah codebase dimulai, buat `docs/IMPLEMENTATION_STATUS.md` yang mencatat:

- milestone terakhir yang benar-benar selesai;
- versi runtime/dependency/integrasi yang dipin;
- acceptance criteria dan command yang lulus beserta tanggal;
- blocker, keputusan terbuka, dan tugas berikutnya;
- perbedaan spesifikasi yang disetujui melalui ADR.

File status tidak berisi credential atau data pengguna. Ia tidak menggantikan PRD atau hasil tes. Agent berikutnya membaca status lalu memeriksa bukti pada codebase, tidak menganggap checklist lama otomatis masih benar.

## 11. Definition of done perubahan kode

Perubahan selesai bila perilakunya sesuai milestone, meaningful checks lulus, tidak merusak invariants, dokumentasi akurat, dan risiko/batas dinyatakan jujur. Jika dependency live belum tersedia, laporkan bagian yang selesai melalui fake/test serta integration gate yang belum terpenuhi.

Dokumentasi ini tidak memberi izin mengubah workbook asli, mengirim WhatsApp kepada peserta sungguhan, menyebarkan layanan publik, atau membelanjakan biaya. Gunakan data sintetis dan lingkungan lokal untuk pekerjaan implementasi yang belum mencakup tindakan tersebut.
