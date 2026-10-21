export function page(title: string, content: string): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="SDJ Assistant membantu mencatat aktivitas harian melalui WhatsApp ke Google Sheets pribadi."><title>${title} | SDJ-Assistant</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f4f6f7;color:#17392f;font:16px/1.7 system-ui,sans-serif}header,main,footer{max-width:820px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}header>a{font-weight:750;text-decoration:none}nav{display:flex;gap:20px;flex-wrap:wrap}a{color:#166c52;text-underline-offset:3px}main{background:#fff;border:1px solid #dfe7e2;border-radius:20px;padding:36px;margin:12px auto}h1{font-size:clamp(28px,5vw,40px);line-height:1.2;letter-spacing:-1px}h2{font-size:21px;margin-top:30px}li{margin:9px 0}.intro{font-size:20px}.label{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#527166}.steps{background:#edf5ef;border-radius:12px;padding:20px 28px}footer{font-size:14px;color:#527166}code{overflow-wrap:anywhere}@media(max-width:860px){main{margin:8px 16px;padding:24px}header,footer{padding:20px}}</style></head><body><header><a href="/">SDJ-Assistant</a><nav aria-label="Navigasi utama"><a href="/">Tentang</a><a href="/privacy">Privasi</a><a href="/terms">Ketentuan</a></nav></header><main>${content}</main><footer>SDJ-Assistant · Pencatatan aktivitas pribadi melalui WhatsApp dan Google Sheets.</footer></body></html>`;
}

export function homePage(): string {
  return page(
    'Catat aktivitas dari WhatsApp',
    `
    <p class="label">Tracker harian pribadi</p>
    <h1>Catat aktivitas Anda melalui percakapan.</h1>
    <p class="intro">SDJ-Assistant menghubungkan instruksi WhatsApp dengan Google Sheets yang Anda pilih, untuk mencatat dan melihat progres aktivitas harian.</p>
    <h2>Apa yang dapat dilakukan?</h2>
    <p>Catat 15 aktivitas, termasuk salat, tilawah, dan kebiasaan harian. Minta ringkasan harian atau bulanan, koreksi nilai, serta batalkan pencatatan terakhir yang masih memenuhi syarat.</p>
    <div class="steps"><h2>Mulai dari WhatsApp</h2><ol><li>Kirim <strong>daftar</strong> satu kali ke nomor bot SDJ-Assistant yang diberikan pengelola.</li><li>Buka tautan pribadi dari balasan paling baru menggunakan Safari atau Chrome, lalu tekan <strong>Lanjutkan</strong>. Tautan berlaku 10 menit; selesaikan login di browser yang sama.</li><li>Login Google, pilih file Google Sheets dan tab tracker Anda.</li><li>Konfirmasikan aktivasi dari DM WhatsApp asal. Setelah aktif, kirim instruksi seperti “tolong catat subuh tiga hari ini”.</li></ol></div>
    <h2>Anda memilih file dan izin</h2>
    <p>Aplikasi meminta akses Google hanya ke file yang Anda pilih melalui Google Picker. Penggunaan AI untuk memahami bahasa sehari-hari memerlukan persetujuan tersendiri; perintah sederhana tersedia tanpa izin AI.</p>
    <p>Baca <a href="/privacy">Kebijakan Privasi</a> dan <a href="/terms">Ketentuan Penggunaan</a> sebelum menghubungkan tracker. Untuk bantuan, hubungi pengelola melalui percakapan WhatsApp bot yang Anda gunakan.</p>
  `
  );
}

export function privacyPage(): string {
  return page(
    'Kebijakan Privasi',
    `
    <h1>Kebijakan Privasi</h1><p>Diperbarui 19 Oktober 2026.</p>
    <p>Kebijakan ini menjelaskan pemrosesan data oleh SDJ-Assistant saat Anda menghubungkan tracker pribadi dan mengirim instruksi melalui WhatsApp. Untuk pertanyaan privasi atau bantuan penghapusan data, hubungi pengelola melalui DM WhatsApp bot yang Anda gunakan.</p>
    <h2>Nama sapaan dan pengingat</h2><p>Dengan izin profil Google, nama sapaan disimpan terenkripsi untuk pesan SDJ. Pengingat tersedia pukul 07.00, 13.00, dan 20.00 WIB, termasuk saat catatan sudah terisi; hentikan melalui “reminder mati”. Nama tidak ditambahkan ke permintaan AI.</p>
    <h2>Data yang diproses</h2>
    <ul><li>Identitas kanal WhatsApp, metadata pengiriman, dan isi pesan yang dikirim kepada bot, untuk mengenali peserta, memproses instruksi, dan mengirim balasan.</li><li>Pengenal akun Google dan token izin akses yang diperoleh melalui login Google.</li><li>ID file, ID tab, struktur tracker, serta nilai aktivitas dan tanggal yang diperlukan untuk membaca atau memperbarui Google Sheets pilihan Anda. Nilai ini dapat mencakup catatan ibadah pribadi.</li><li>Status koneksi, persetujuan AI, sesi penghubungan, serta catatan proses dan perubahan untuk validasi, pemulihan kegagalan, dan undo.</li></ul>
    <h2>Penggunaan data Google</h2>
    <p>Login menggunakan izin <code>openid</code> untuk mengenali akun, <code>profile</code> untuk nama sapaan jika tersedia, dan <code>drive.file</code> untuk mengakses file yang Anda pilih melalui Google Picker. Aplikasi membaca struktur dan nilai tracker, menulis aktivitas sesuai instruksi Anda, memeriksa hasil penulisan, dan mengirim ringkasan ke DM WhatsApp Anda. Aplikasi tidak meminta akses umum ke seluruh Google Drive.</p>
    <p>Saat Anda memilih Validasi &amp; perbaiki, aplikasi menormalkan input tracker dan menyimpan rekam nilai, rumus, catatan sel serta aturan asal pada tab cadangan tersembunyi di file Google Sheets yang sama sebelum perubahan. Cadangan mengikuti akses file tersebut, tidak dikirim ke AI, dan tetap berada pada file Anda setelah penghubungan dibatalkan atau akun aplikasi dilepas.</p>
    <p>Token Google digunakan oleh backend untuk menjalankan akses yang Anda izinkan; token tidak disertakan dalam permintaan interpretasi AI. Penggunaan informasi dari Google API mengikuti <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, termasuk persyaratan Limited Use.</p>
    <h2>Pemrosesan bahasa sehari-hari dan penyedia layanan</h2>
    <p>Jika Anda menyetujui pemrosesan AI, teks instruksi dan konteks klarifikasi yang relevan dapat dikirim ke Groq, Google Gemini, NVIDIA, atau OpenRouter beserta penyedia model gratis yang dipilihnya untuk memahami tindakan, aktivitas, nilai, dan tanggal. Persetujuan terbaru pada onboarding dan chat mencakup layanan tersebut. Persetujuan lama tidak diperluas otomatis; pembaruan ditawarkan melalui chat. Permintaan OpenRouter dibatasi ke model gratis dengan penyaringan penyedia yang tidak mengumpulkan data (<code>data_collection: deny</code>). Identitas kanal, token Google, dan credential database tidak ditambahkan ke permintaan model. Informasi pribadi yang Anda ketik sendiri di dalam pesan tetap dapat menjadi bagian teks yang diproses. Jangan mengirim password atau secret kepada bot.</p>
    <p>WhatsApp mengantarkan pesan; Google menyediakan login dan akses file; Supabase PostgreSQL menyimpan data operasional backend. Aplikasi dijalankan pada VPS Jagoan Hosting. Penyedia ini memproses data yang diperlukan untuk layanan masing-masing sesuai kebijakan mereka. Tanpa persetujuan AI, perintah sederhana tetap dapat dipakai.</p>
    <h2>Penyimpanan dan sesi</h2>
    <p>Backend mengenkripsi teks pesan, token refresh Google, dan payload sensitif yang disimpan aplikasi. Identitas dan data proses dipisahkan per peserta. Cookie sesi dan CSRF diperlukan untuk mengikat proses login ke browser Anda; sesi penghubungan berlaku 10 menit. Halaman aplikasi ini tidak memasang pelacak iklan.</p>
    <p>Pemeliharaan membersihkan teks pesan yang prosesnya selesai setelah tujuh hari. Catatan proses, balasan, dan perubahan yang telah selesai dibersihkan setelah 30 hari ketika tidak lagi dibutuhkan oleh proses lain. Pekerjaan aktif, pengiriman tertunda, atau hasil penulisan yang belum pasti dapat menunda pembersihan sampai diselesaikan. Nilai pada Google Sheets tetap berada pada file Anda dan tidak dihapus oleh pembersihan backend.</p>
    <h2>Menghentikan akses dan menghapus data</h2>
    <p>Kirim <strong>putus koneksi</strong> untuk memulai pelepasan koneksi, atau <strong>hapus akun</strong> untuk meminta penghapusan data peserta dari aplikasi; bot akan meminta konfirmasi. Penghapusan diproses melalui pemeliharaan setelah pekerjaan aktif atau hasil perubahan yang belum pasti diselesaikan. Penanda administratif permintaan penghapusan dapat dipertahankan. Penghapusan akun aplikasi tidak menghapus file Google Sheets Anda atau riwayat yang tersimpan di WhatsApp/perangkat Anda.</p>
    <p>Anda juga dapat mencabut izin aplikasi melalui <a href="https://myaccount.google.com/connections">koneksi akun Google</a>. Untuk mengubah persetujuan AI atau menanyakan data yang masih diproses, hubungi pengelola melalui bot.</p>
  `
  );
}

export function termsPage(): string {
  return page(
    'Ketentuan Penggunaan',
    `
    <h1>Ketentuan Penggunaan</h1><p>Diperbarui 19 Oktober 2026.</p>
    <h2>Penggunaan tracker pribadi</h2><p>SDJ-Assistant membantu pencatatan aktivitas pribadi melalui WhatsApp dan Google Sheets. Hubungkan hanya akun dan file yang Anda berhak gunakan. Setiap peserta memulai penghubungan dari nomor WhatsApp sendiri, login Google, memilih tracker, dan mengonfirmasi aktivasi dari DM asal.</p>
    <h2>Instruksi dan hasil pencatatan</h2><p>Aplikasi mendukung 15 aktivitas dan maksimal lima aktivitas dalam satu instruksi pencatatan. Skor salat memakai nilai 0–3; jenis aktivitas lain memiliki nilai sesuai katalog. Bot dapat meminta klarifikasi bila instruksi belum lengkap. Periksa balasan dan isian tracker Anda; gunakan koreksi atau undo yang tersedia ketika diperlukan. Undo berlaku untuk kelompok pencatatan terakhir selama 10 menit jika nilai belum berubah.</p>
    <h2>Perbaikan aturan tracker</h2><p>Dengan menekan Validasi &amp; perbaiki saat menghubungkan tracker, Anda mengizinkan aplikasi mengganti aturan input yang tidak cocok pada sel aktivitas dan tanggal yang dikenali. Semua aturan input disesuaikan ke katalog SDJ. Teks angka yang jelas dikonversi sesuai locale spreadsheet; teks TRUE/FALSE dan angka 0/1 pada checkbox menjadi boolean. Isian yang tidak dapat dipastikan dikosongkan. Rumus tepat pada sel input diganti dengan hasil yang valid atau dikosongkan. Nilai, rumus, dan aturan asal disimpan serta diverifikasi di tab cadangan tersembunyi pada file yang sama sebelum perubahan. Data yang sudah benar, catatan sel pribadi, rumus rekap, target, dan tampilan dipertahankan. Perbaikan tetap berlaku meskipun aktivasi dibatalkan; undo pencatatan tidak mengembalikan perbaikan ini.</p>
    <h2>Akses dan ketersediaan</h2><p>Jaga tautan penghubungan dan kode konfirmasi untuk penggunaan sendiri. Jangan membagikan token, mengambil data peserta lain, atau mengganggu layanan. Layanan bergantung pada server, koneksi internet, WhatsApp, Google, dan ketersediaan penyedia AI. Batas panggilan atau gangguan dapat membuat instruksi perlu dikirim kembali setelah bot menyatakan belum ada perubahan.</p>
    <h2>Pengingat SDJ</h2><p>Peserta dengan akun dan tracker aktif menerima pengingat pukul 07.00, 13.00, dan 20.00 WIB, termasuk jika catatan telah terisi. Kirim “reminder mati” untuk berhenti atau “reminder aktif” untuk mengaktifkan kembali. Nama sapaan berasal dari profil Google jika diizinkan, disimpan terenkripsi, dan tidak ditambahkan ke permintaan AI.</p>
    <h2>Persetujuan dan penghentian</h2><p>Pemrosesan AI bersifat pilihan dan dijelaskan pada <a href="/privacy">Kebijakan Privasi</a>. Anda dapat meminta pelepasan koneksi atau penghapusan akun melalui DM bot; proses memerlukan konfirmasi. Menghapus akun aplikasi tidak menghapus file Google Sheets pribadi Anda.</p>
    <h2>Bantuan</h2><p>Untuk bantuan, koreksi masalah, atau pertanyaan tentang penggunaan dan privasi, hubungi pengelola melalui percakapan WhatsApp bot yang Anda gunakan.</p>
  `
  );
}
