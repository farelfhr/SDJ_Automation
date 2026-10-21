# Panduan lengkap login Google untuk SDJ Assistant

## Konfigurasi tracker otomatis

Setelah login dan memilih file serta tab tracker, klik **Validasi dan kirim konfirmasi ke WhatsApp**. Sistem membaca struktur, mencoba profil acuan, lalu menyesuaikan variasi yang dikenali. Periksa jumlah aktivitas dan rentang tanggal pada ringkasan, kemudian kirim perintah `hubungkan KODE` yang diterima melalui DM asal. Analisis tidak mengubah isi atau aturan file. Jika gagal, catat aktivitas, alamat sel, dan jenis aturan pada pesan error; mengulang putus-sambung tidak memperbaiki aturan sheet yang belum didukung. Batas penyesuaian ada di [ADR 0006](../adr/0006-adaptive-tracker-configuration.md).

Panduan ini memakai `.env` dan Supabase utama proyek di `D:\Dev\SDJ_Automation`. Status **Testing** di Google hanya mengatur siapa yang boleh login ke aplikasi; backend tetap memakai environment utama yang sama.

Deployment aktif memakai `https://app.sdj-rumah-kepemimpinan.my.id` pada VPS. DNS, HTTPS, homepage, privasi, dan ketentuan telah diperiksa. Tambahkan origin/redirect dan pembatasan key pada [panduan akses publik](public-access.md); entri localhost boleh dipertahankan bila masih dipakai untuk pengembangan.

## Membuka akses peserta umum pada deployment aktif

Pada 18 Oktober pemilik melaporkan Audience masih Testing dan Publish app terkunci. Backend menerima peserta baru dan hanya meminta openid + drive.file; pembatasan Audience berada di Google Console, tidak dapat dibuka dengan mengubah .env.

1. Buka [Branding project SDJ](https://console.cloud.google.com/auth/branding?project=sdj-assistant) dengan akun pemilik project.
2. Isi App name `SDJ-Assistant`, User support email dan Developer contact information dengan email pengelola yang aktif.
3. Application home page: `https://app.sdj-rumah-kepemimpinan.my.id/`.
4. Application privacy policy link: `https://app.sdj-rumah-kepemimpinan.my.id/privacy`.
5. Application terms of service link: `https://app.sdj-rumah-kepemimpinan.my.id/terms`.
6. Authorized domains: `sdj-rumah-kepemimpinan.my.id`, tanpa protokol/path. Simpan. Selesaikan permintaan kepemilikan domain atau verifikasi Branding yang benar-benar ditampilkan Console.
7. Kembali ke [Audience](https://console.cloud.google.com/auth/audience?project=sdj-assistant), pastikan External, klik Publish app jika sudah tersedia, lalu ikuti dialog sampai status In production. Jika masih terkunci, periksa pesan validasi yang ditampilkan; status terkunci saja belum menentukan semua penyebab.
8. Jika Branding menampilkan Verify Branding, jalankan evaluasi lalu periksa hasilnya; Publish branding setelah Ready to publish bila diminta. Publish branding dan Publish app adalah tindakan yang berbeda. Tidak menjanjikan seluruh verifikasi Google otomatis lolos.
9. Periksa Data Access sesuai scope aplikasi (`openid` dan `https://www.googleapis.com/auth/drive.file`), tanpa menambahkan akses Drive/Sheets yang lebih luas untuk mengatasi pembatasan peserta.
10. Minta peserta kedua mengirim `daftar` dari nomor sendiri, membuka tautan baru pada Safari/Chrome, login akun Google sendiri, memilih tracker berizin edit dan mengonfirmasi dari DM asal. Akun Workspace dapat mempunyai pembatasan administrator terpisah.

Pesan “Your branding is not being shown to users” disertai “Verification is not required since your app is not requesting any sensitive or restricted scopes” membedakan dua status. Verifikasi data access tidak diperlukan untuk scope aktif; Branding yang belum dipublikasikan berkaitan dengan identitas yang ditampilkan pada consent screen. Pesan ini sendiri bukan bukti akses peserta umum diblokir. Periksa Audience External/In production dan uji akun kedua terlebih dahulu; selesaikan verifikasi Branding secara terpisah untuk menampilkan identitas aplikasi sesuai ketentuan Google.

Jalur sementara untuk peserta yang ditentukan: Audience → Test users → Add users → email Google peserta → Save. Ini tetap memakai VPS dan database utama. Karena aplikasi meminta drive.file dengan offline access, Google membatasi masa authorization/refresh token Testing; gunakan In production untuk pengoperasian berkelanjutan sesuai persyaratan Google. [Audience resmi](https://support.google.com/cloud/answer/15549945), [Branding resmi](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

Jika Google meminta verifikasi Authorized domain:

1. Buka [Google Search Console](https://search.google.com/search-console/welcome) dengan akun pemilik/editor project Google Cloud.
2. Pilih jenis properti **Domain** dan isi `sdj-rumah-kepemimpinan.my.id`, lalu Continue.
3. Salin nilai TXT `google-site-verification=...` yang diberikan Google. Ini record publik untuk verifikasi, bukan OAuth secret.
4. Pada DNS Management yang benar-benar melayani nameserver domain, tambahkan TXT di root (`@` atau kosong sesuai panel), Value isi persis dari Google, TTL default. Pertahankan record A app dan TXT lain.
5. Sesudah TXT menjawab melalui DNS publik, klik Verify di Search Console. Pertahankan record ini agar kepemilikan tetap terverifikasi.
6. Kembali ke Branding/Verification Center dan lanjutkan langkah yang ditampilkan. Verifikasi subdomain saja tidak membuktikan kepemilikan domain induk yang diminta Google.

Pemeriksaan 18 Oktober tidak menemukan TXT Google pada root; itu bukan bukti bahwa semua metode verifikasi lain belum pernah dilakukan. Ikuti permintaan Console yang aktual. [Domain pada verifikasi brand](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification#authorized-domains), [verifikasi Search Console](https://support.google.com/webmasters/answer/9008080).

Client OAuth dan key Picker yang Anda berikan sudah dimasukkan ke `.env` utama. Redirect URI dan origin dalam file OAuth cocok dengan aplikasi. Anda dapat mulai dari bagian 2 untuk memeriksa API, audience, dan pembatasan key. Langkah berikut juga berguna untuk membuat ulang kredensial bila diperlukan.

## 1. Pilih atau buat satu Google Cloud project

1. Buka [Google Cloud Console](https://console.cloud.google.com/) dan login dengan akun Google pemilik pengaturan aplikasi.
2. Di bagian atas, klik **pemilih project** di sebelah logo Google Cloud. Tombol ini menampilkan nama project atau **Select a project**.
3. Bila project sudah ada, klik namanya lalu **Open**. Gunakan project yang sama dengan file OAuth yang sudah dibuat.
4. Jika mulai dari awal, klik **New Project**. Isi **Project name**, misalnya `SDJ Assistant`. Pilih organisasi/location bila akun mewajibkannya, lalu klik **Create**.
5. Setelah project selesai dibuat, klik notifikasi di kanan atas lalu **Select Project**, atau buka pemilih project dan pilih project baru.
6. Periksa nama project di bagian atas setiap kali berpindah halaman. OAuth client, API key, dan App ID harus berasal dari project yang sama.

## 2. Aktifkan ketiga API

Ulangi urutan ini untuk **Google Sheets API**, **Google Drive API**, dan **Google Picker API**:

1. Klik ikon menu **☰** di kiri atas.
2. Pilih **APIs & Services → Library**. Jika menu sulit ditemukan, gunakan pencarian di bagian atas dan cari `API Library`.
3. Klik kotak **Search for APIs & Services**, ketik nama API lengkap, lalu tekan Enter.
4. Klik hasil resmi Google dengan nama API yang sesuai.
5. Klik **Enable**. Tunggu sampai halaman berpindah ke pengelolaan API.
6. Jika tombol yang muncul **Manage** atau **Disable API**, API sudah aktif.
7. Kembali ke **Library**, lalu lakukan langkah yang sama untuk API berikutnya.

Terakhir, buka **APIs & Services → Enabled APIs & services**. Periksa bahwa ketiganya tercantum. Picker digunakan untuk memilih file; Drive memeriksa jenis file dan hak edit; Sheets membaca serta menulis sel tracker.

## 3. Atur nama aplikasi dan siapa yang boleh login

1. Klik **☰ → Google Auth Platform → Overview**. Pada tampilan lama, buka **APIs & Services → OAuth consent screen**; Google dapat mengarahkan Anda ke Google Auth Platform.
2. Jika muncul **Google Auth platform not configured yet**, klik **Get started**.
3. Pada **App Information**, isi **App name** dengan `SDJ Assistant` dan pilih email Anda pada **User support email**. Klik **Next**.
4. Pada **Audience**, pilih **External**, lalu klik **Next**. Pilihan ini mendukung akun Gmail pribadi.
5. Pada **Contact Information**, isi email kontak pengelola. Klik **Next**.
6. Pada **Finish**, baca kebijakan yang ditampilkan. Jika sesuai, centang persetujuan kebijakan lalu klik **Continue → Create**.
7. Setelah konfigurasi selesai, pilih **Audience** di menu kiri.
8. Pada bagian **Test users**, klik **Add users**. Masukkan email Google yang akan dipakai login dan membuka tracker. Klik **Save**. Bila memakai dua akun untuk uji isolasi, masukkan kedua email.
9. Periksa bahwa email benar-benar masuk daftar. Status **Testing** hanya menerima akun tester yang didaftarkan. Untuk tujuan terbaru menerima peserta umum, pilih **Audience → Publish app**, ikuti dialog Console, dan pastikan status berubah menjadi **In production**. Selesaikan persyaratan verifikasi/branding yang diminta Google bila ada. Lihat [pemulihan akses akun teman](public-access.md#akun-pemilik-bisa-login-akun-teman-diblokir).

Jika project sebelumnya sudah dikonfigurasi, lewati wizard **Get started**: periksa nama/email pada **Branding**, kemudian audience dan daftar akun pada **Audience**.

Pengaturan consent dan audience mengikuti [panduan resmi Google Auth Platform](https://developers.google.com/workspace/guides/configure-oauth-consent?hl=id).

## 4. Tambahkan izin yang dipakai aplikasi

1. Di **Google Auth Platform**, klik **Data Access** di kiri.
2. Klik **Add or remove scopes**.
3. Cari dan pilih `openid` serta `https://www.googleapis.com/auth/drive.file`.
4. Jika tidak tampil dalam daftar, gunakan **Manually add scopes**, masukkan URI scope, lalu klik **Add to table** bila tombol tersebut tersedia.
5. Klik **Update**, kemudian **Save** bila ditampilkan.
6. Periksa kedua izin pada daftar yang tersimpan.

Kode aplikasi meminta `openid` untuk identitas akun Google dan `drive.file` untuk file yang dipilih melalui Picker. Jangan mengganti `drive.file` dengan izin seluruh Google Drive.

## 5. Buat OAuth client tipe Web application

Bagian ini sudah Anda kerjakan. Untuk memeriksa atau membuat ulang:

1. Buka **Google Auth Platform → Clients**.
2. Klik **Create client**.
3. Pada **Application type**, pilih **Web application**.
4. Isi **Name** dengan `SDJ Web Utama`.
5. Pada **Authorized JavaScript origins**, klik **Add URI** dan isi persis:

   ```text
   https://app.sdj-rumah-kepemimpinan.my.id
   ```

6. Pada **Authorized redirect URIs**, klik **Add URI** dan isi persis:

   ```text
   https://app.sdj-rumah-kepemimpinan.my.id/connect/google/callback
   ```

7. Klik **Create**. Simpan **Client ID** dan **Client secret** ke tempat privat saat dialog menampilkannya. Gunakan **Download JSON** bila tersedia. Secret mungkin hanya ditampilkan saat pembuatan.
8. Untuk client yang sudah ada, klik namanya di halaman **Clients**, periksa kedua bagian URI, ubah bila perlu, lalu klik **Save**.

Origin hanya alamat dasar. Redirect URI memuat `/connect/google/callback` dan harus cocok persis tanpa slash tambahan. Deployment memakai HTTPS pada domain app; entri localhost terpisah hanya untuk pengembangan. Sumber: [pembuatan kredensial Google](https://developers.google.com/workspace/guides/create-credentials), [OAuth web server](https://developers.google.com/identity/protocols/oauth2/web-server).

## 6. Buat dan batasi API key Google Picker

Key sudah diberikan; sekarang periksa pembatasannya:

1. Buka **☰ → APIs & Services → Credentials**.
2. Pada daftar **API keys**, klik key yang dibuat untuk Picker. Untuk membuat baru: **Create credentials → API key**, lalu klik **Edit API key** atau **Restrict key**.
3. Pada **Name**, beri nama `SDJ Google Picker`.
4. Pada **Application restrictions**, pilih **Websites**. Beberapa tampilan menyebutnya **HTTP referrers (web sites)**.
5. Pada **Website restrictions**, klik **Add**, masukkan `https://app.sdj-rumah-kepemimpinan.my.id/*`, lalu klik **Done** bila tersedia. Entri localhost terpisah boleh dipertahankan untuk pengembangan.
6. Klik **Add** lagi dan masukkan `https://docs.google.com/*`.
7. Pada **API restrictions**, pilih **Restrict key**.
8. Buka daftar **Select APIs**, centang **Google Picker API** dan **Google Drive API**, lalu klik **OK** bila tersedia.
9. Klik **Save** di bawah. Tunggu beberapa menit jika Google belum menerapkan perubahan.

Izin `docs.google.com` diperlukan karena Picker berjalan dalam iframe Google. Client ID berakhiran `.apps.googleusercontent.com` berbeda dari API key Picker. [Panduan resmi pembatasan key Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample).

## 7. Temukan Project number untuk GOOGLE_APP_ID

1. Klik **☰ → IAM & Admin → Settings**.
2. Cari **Project number**, lalu klik ikon salin di samping angkanya.
3. Salin angka itu ke `GOOGLE_APP_ID`.
4. Jika tidak terlihat, buka **☰ → Cloud overview → Dashboard**, lalu cari kartu **Project info**.

Gunakan **Project number**, bukan Project name atau Project ID. Saat impor otomatis, aplikasi mengambil angka prefix Client ID sebagai nilai awal; cocokkan dengan Project number di Console untuk memastikannya.

## 8. Isi file .env utama

Saya sudah mengimpor nilai dari file Anda. Untuk memeriksa sendiri:

1. Buka folder `D:\Dev\SDJ_Automation` di editor.
2. Buka file `.env` pada folder paling atas. Pada VS Code, tekan **Ctrl+P**, ketik `.env`, lalu Enter.
3. Cari dengan **Ctrl+F** setiap nama berikut dan ganti nilai pada baris yang sudah ada. Jangan membuat duplikat atau mengubah key database/enkripsi.

   ```dotenv
   GOOGLE_CLIENT_ID=client-id-dari-google
   GOOGLE_CLIENT_SECRET=client-secret-dari-google
   GOOGLE_PICKER_API_KEY=api-key-picker
   GOOGLE_APP_ID=project-number
   PUBLIC_BASE_URL=https://app.sdj-rumah-kepemimpinan.my.id
   ```

4. Tekan **Ctrl+S**. Gunakan `.env` utama; loader aplikasi hanya membaca file tersebut.
5. Setelah perubahan, hentikan proses aplikasi dengan **Ctrl+C**, lalu jalankan `pnpm dev` dari terminal pada folder proyek. Jika proses sedang dikelola Codex, beri tahu bahwa konfigurasi sudah disimpan agar proses yang sama dapat direstart.

Secret dan file JSON OAuth jangan dimasukkan ke Git. Karena secret OAuth sempat dibagikan melalui chat, buat penggantinya di Google Cloud sebelum aplikasi dibuka bagi peserta lain, lalu perbarui `.env`.

## 9. Login dan pilih tracker

1. Setelah kanal WhatsApp terhubung, kirim `daftar` melalui DM ke bot.
2. Buka tautan balasan paling baru pada Safari/Chrome di perangkat peserta, lalu tekan **Lanjutkan**. Tautan domain app berlaku 10 menit dan terikat satu browser; peserta tidak perlu memakai komputer pengelola. Selesaikan seluruh login di browser yang sama. Membuka halaman atau pratinjau tidak menghabiskan token.
3. Pilih persetujuan pemrosesan AI bila ingin memakai bahasa bebas, lalu klik **Hubungkan akun Google**.
4. Login dengan akun Google peserta sendiri. Jika Audience masih Testing, email harus ada pada **Test users**; untuk akses umum selesaikan External/In production. Periksa izin lalu lanjutkan sesuai layar Google.
5. Kembali ke aplikasi, klik **Pilih Google Sheet**, pilih tracker, lalu klik tombol pemilihan file pada Picker.
6. Pilih tab tracker pada dropdown, lalu klik **Validasi dan kirim konfirmasi ke WhatsApp**.
7. Buka DM bot dan balas `hubungkan KODE` sesuai kode yang dikirim. Konfirmasi harus berasal dari DM yang sama.
8. Setelah menerima pesan tracker terhubung, coba satu perintah yang memang ingin dicatat, misalnya `zuhur 3`, lalu periksa tanggal dan hasilnya pada sheet.

Tracker harus Google Sheets native dan akun Google harus punya izin edit. Link berbagi saja belum memberi aplikasi izin OAuth. `localhost` hanya berlaku pada komputer yang menjalankan API. Untuk membuka tautan onboarding di HP, diperlukan URL HTTPS yang dapat diakses HP, lalu origin, redirect, restrictions, dan `PUBLIC_BASE_URL` harus disesuaikan.

## 10. Jika muncul error

| Pesan | Periksa |
| --- | --- |
| `redirect_uri_mismatch` | Pada **Clients**, cocokkan redirect URI lengkap, port 3000, protokol, dan slash. |
| `access_denied` atau akun tidak diizinkan | **Audience → Test users** berisi email yang sedang dipakai. Kebijakan akun Workspace juga dapat membatasi akses. |
| `API developer key is invalid` | Key dari project yang sama, Picker/Drive aktif, dan kedua referrer pada bagian 6 tersimpan. |
| Picker kosong atau tidak bisa membuka sheet | Pilih akun yang punya akses file; pastikan file native Google Sheets dan berizin editor. |
| `GOOGLE_NOT_CONFIGURED` | Simpan empat variabel di `.env`, kemudian restart API/worker. |
| Tautan onboarding sudah dipakai/kedaluwarsa | Jika belum lewat 10 menit, lanjutkan di browser awal. Jika sesi sudah berakhir, kirim `daftar` satu kali, tunggu balasan terakhir dan gunakan tautan terbaru. Setiap permintaan baru membatalkan tautan sebelumnya. Jangan berpindah browser di tengah login. |
| Browser tidak dapat membuka localhost | Gunakan browser komputer aplikasi; cek proses API dan port 3000. |

Nama tombol dapat sedikit berbeda menurut bahasa akun dan pembaruan Console. Gunakan nama menu Inggris di atas sebagai acuan. Sumber diperiksa pada 15 Oktober 2026; status pengujian aplikasi tercatat terpisah di `docs/IMPLEMENTATION_STATUS.md`.
