# Akses peserta melalui domain VPS

Domain aktif adalah `https://app.sdj-rumah-kepemimpinan.my.id`. DNS dan HTTPS serta halaman publik telah diverifikasi pada 18 Oktober 2026. VPS menjalankan API, worker, gateway, proxy, dan Caddy melalui systemd; komputer lokal dan ngrok tidak diperlukan.

## Operasional deployment

Ikuti [runbook VPS](vps-deployment.md) untuk restart/diagnostik. Jangan menjalankan gateway lokal dengan sesi WhatsApp yang sama saat VPS aktif. Environment utama memakai role/key yang sama; layanan VPS membaca secret terpilih dari `/etc/sdj/`.

Alamat utama:

```dotenv
PUBLIC_BASE_URL=https://app.sdj-rumah-kepemimpinan.my.id
PUBLIC_PROXY_PORT=3001
```

API tetap loopback pada port 3000. Launcher OpenClaw memakai port API loopback untuk ingress/outbox, terpisah dari `PUBLIC_BASE_URL`. Caddy meneruskan HTTPS ke proxy publik loopback 3001. Proxy hanya mengizinkan metode/rute onboarding serta halaman publik yang dikenal. `/internal/*` dan `/health/*` tidak diteruskan. Penambahan rute onboarding baru perlu disertakan pada allowlist `scripts/public-proxy.mjs`.

Tidak ada access log request/query OAuth pada proxy publik.

## Tambahkan domain pada Google Cloud

Gunakan OAuth client dan API key yang sudah ada pada project nomor **615901743**; tidak perlu mengganti secret.

1. Buka [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials), pilih project yang benar.
2. Pada **OAuth 2.0 Client IDs**, klik client web aplikasi. Alternatif tampilan: **Google Auth Platform → Clients**, lalu pilih client yang sama.
3. Di **Authorized JavaScript origins**, klik **Add URI**, isi `https://app.sdj-rumah-kepemimpinan.my.id`.
4. Di **Authorized redirect URIs**, klik **Add URI**, isi `https://app.sdj-rumah-kepemimpinan.my.id/connect/google/callback`.
5. Klik **Save**. Pertahankan entri localhost bila masih diperlukan; tautan baru aplikasi memakai domain publik.
6. Kembali ke **APIs & Services → Credentials**, klik API key untuk Google Picker.
7. Di **Application restrictions → Websites → Website restrictions**, klik **Add**, masukkan `https://app.sdj-rumah-kepemimpinan.my.id/*`, lalu **Done**. Pertahankan `https://docs.google.com/*` dan batas API yang sudah diperlukan aplikasi.
8. Klik **Save**, tunggu penerapan konfigurasi Google sebelum mencoba ulang.
9. Untuk menerima akun Google peserta umum, buka **Google Auth Platform → Audience**, pastikan **User type: External**, lalu pada **Publishing status** pilih **Publish app**, baca dialog, dan konfirmasi. Target statusnya **In production**. Jika Console meminta verifikasi atau kelengkapan branding/domain, selesaikan persyaratan yang ditampilkan; jangan menganggap tombol publish menghapus seluruh pembatasan Google.
10. Jika aplikasi tetap **Testing**, akses hanya untuk daftar Test users: **Audience → Test users → Add users → masukkan email Google teman → Save**. Ini alternatif akses terbatas, bukan membuka semua akun. Status Testing Google terpisah dari environment backend; aplikasi tetap memakai `.env` dan database utama.

Redirect URI harus cocok persis, termasuk skema, domain, dan path: [dokumentasi OAuth Google](https://developers.google.com/identity/protocols/oauth2/web-server). Pembatasan website Picker: [contoh resmi Google Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample).

## Publish app terkunci karena Branding belum lengkap

Tangkapan layar pemilik menunjukkan **Testing**, satu Test user, dan pesan **To publish your app, you must complete your configuration on the Branding page**. App name dan User support email sudah terisi; bagian App domain masih kosong. Homepage, privasi, dan ketentuan kini disediakan oleh API serta diizinkan proxy publik tanpa sesi login.

Pada **Google Auth Platform → Branding**, isi:

| Kolom | URL |
| --- | --- |
| Application home page | `https://app.sdj-rumah-kepemimpinan.my.id/` |
| Application privacy policy link | `https://app.sdj-rumah-kepemimpinan.my.id/privacy` |
| Application terms of service link | `https://app.sdj-rumah-kepemimpinan.my.id/terms` |
| Authorized domains | `sdj-rumah-kepemimpinan.my.id` |

Gulir sampai bagian bawah, pastikan Developer contact information berisi email pengelola yang dipantau, lalu klik Save. Lengkapi Authorized domains sesuai validasi Console dan periksa kembali Audience. Tombol Publish app hanya dapat dilanjutkan setelah prasyarat Google terpenuhi. Jangan mengisi URL callback pada ketiga kolom di atas.

Ketiga halaman publik sudah merespons HTTPS 200. Jika diminta, buktikan kepemilikan domain registrasi melalui Google Search Console memakai akun yang mempunyai akses Owner/Editor pada project Google Cloud. Jika Branding menampilkan Verify Branding, jalankan, tinjau hasilnya, lalu Publish branding saat Ready to publish. Ini berbeda dari Audience → Publish app. Lihat [verifikasi brand resmi](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification). Akses peserta umum belum dinyatakan selesai sebelum status Audience dan login peserta kedua terbukti.

## Akun pemilik bisa login, akun teman diblokir

Kalimat umum “Access blocked” belum cukup untuk memastikan penyebab. Periksa kode pada bagian bawah halaman Google atau tautan detail error:

| Kode atau gejala | Tindakan |
| --- | --- |
| `access_denied` dengan pesan aplikasi sedang diuji/hanya tester yang disetujui | Ubah External menjadi In production untuk akses umum, atau tambahkan email peserta ke Test users jika tetap Testing. |
| `org_internal` | Periksa User type; akun luar organisasi membutuhkan External. |
| `disallowed_useragent` | Peserta meminta tautan baru dari DM sendiri, lalu membuka langsung di Safari/Chrome sebelum login; jangan berpindah browser di tengah OAuth. |
| `redirect_uri_mismatch` | Cocokkan Authorized redirect URIs dengan domain publik dan path callback persis seperti bagian sebelumnya. |
| `admin_policy_enforced` atau blokir akun kantor/sekolah | Administrator Workspace peserta perlu meninjau izin aplikasi; publish tidak mengesampingkan kebijakan organisasi. |
| Aplikasi menampilkan sesi/tautan kedaluwarsa setelah kembali dari Google | Kirim `daftar` dari nomor sendiri, gunakan tautan baru sekali di browser yang sama hingga aktivasi selesai. Tautan yang sudah dibuka di perangkat lain tidak dapat dipakai kembali. |

Setiap peserta harus meminta tautan dari nomor WhatsApp sendiri. Jangan membagikan tautan onboarding pribadi milik pemilik; yang dapat dibagikan umum adalah domain dan nomor bot. Sesi terikat browser dan DM asal. Jangan memindahkan URL callback dari satu browser ke browser lain atau menghapus pemeriksaan cookie/state untuk mengatasi blokir Google.

Aplikasi saat ini hanya meminta `openid` dan `https://www.googleapis.com/auth/drive.file`. Drive menggolongkan `drive.file` sebagai non-sensitive; jangan menambah izin seluruh Drive/Sheets untuk memperbaiki blokir audience. Periksa agar Data Access pada Console mendeklarasikan izin yang digunakan. Status publish/verifikasi dan kebijakan akun tetap dikelola Google: [Manage App Audience](https://support.google.com/cloud/answer/15549945), [scope resmi Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [kebijakan browser OAuth](https://developers.google.com/identity/protocols/oauth2/policies).

## Alur peserta dan pemeriksaan

1. Peserta mengirim `daftar` ke nomor WhatsApp bot.
2. Bot mengirim tautan pribadi dengan domain publik dan token berlaku 10 menit. Tautan lama localhost perlu diganti dengan permintaan baru.
3. Buka tautan dari HP/laptop lain, login Google, pilih Sheet/tab, kemudian konfirmasi kode aktivasi dari DM asal.
4. Pastikan pengguna kedua dapat login, memilih file sendiri, dan mengaktifkan tracker pada DM sendiri.

Membuka domain utama menampilkan penjelasan aplikasi, petunjuk meminta tautan pribadi dari bot, serta tautan privasi dan ketentuan. `/connect/status` tanpa cookie sesi mengembalikan 401; ini benar, bukan gangguan tunnel. Periksa database melalui `/health/ready` pada localhost saja. Jangan menyalin URL callback, cookie, token, atau output status kanal yang berisi identitas peserta.

Ngrok hanya riwayat pengembangan sebelumnya; deployment VPS tidak menjalankan tunnel tersebut.
