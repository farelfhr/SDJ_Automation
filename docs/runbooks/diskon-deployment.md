# Deployment domain SDJ di Diskon.com

Target domain: `sdj-rumah-kepemimpinan.my.id`. Checkpoint 18 Oktober 2026, Asia/Jakarta. Domain dimiliki pengguna dan panel hosting pada tangkapan layar adalah CWP dengan Apache/PHP/MySQL, storage 2 GB, bandwidth 25 GB. Menu runtime Node.js/SSH belum dikonfirmasi.

## Bagian yang dapat dipasang sekarang

Hosting statis dapat melayani homepage, Kebijakan Privasi, dan Ketentuan Penggunaan. Kode API, worker antrean, maintenance, dan gateway WhatsApp tetap membutuhkan runtime Node.js serta proses berkelanjutan dan penyimpanan sesi. Adanya PHP/MySQL, File Manager, Cron, atau Node.js untuk web saja belum membuktikan seluruh proses tersebut boleh berjalan.

[Penjelasan resmi Diskon.com](https://diskon.com/blog/resource-hosting-node-js) menjelaskan bahwa paket gratis dengan spesifikasi tersebut lebih sesuai untuk PHP/website statis; dukungan Node.js perlu dikonfirmasi penyedia. Jangan mengubah backend menjadi script PHP proxy atau memanggil OAuth dengan credential di browser sebagai jalan pintas.

## 1. Periksa DNS sebelum SSL dan upload

Probe publik saat checkpoint gagal: Cloudflare DNS mengembalikan SERVFAIL dengan keterangan **No Reachable Authority** dan **REFUSED** pada nameserver; Google juga gagal (SERVFAIL/NXDOMAIN pada probe berbeda). Ini menunjukkan domain belum dapat diandalkan dari internet, bukan bukti file aplikasi salah. Penyebab pasti registrasi/zone/delegasi belum diverifikasi.

1. Pada panel Diskon.com, buka **DNS Functions → DNS Zone Editor**.
2. Pilih domain `sdj-rumah-kepemimpinan.my.id`. Pastikan zone tersebut ada.
3. Periksa record A untuk apex/root, biasanya bernama domain lengkap atau `@`. Alamat harus mengikuti **IP Server** yang ditampilkan panel akun, bukan IP ngrok/laptop. Jangan mengubah record domain lain.
4. Pada panel pengelolaan domain/registrar, periksa status aktif dan nameserver. Cocokkan dengan nameserver yang diberikan hosting. DNS Zone Editor dan nameserver registrar adalah dua bagian yang berbeda; zone yang benar pada server yang tidak didelegasikan tidak akan dipakai internet.
5. Bila zone hilang, domain belum aktif, atau nameserver menolak query, minta penyedia memperbaikinya sebelum mengubah Google OAuth.
6. Ulangi pemeriksaan DNS dan akses HTTP/HTTPS. Jangan hanya menunggu propagasi tanpa memeriksa kesesuaian zone/delegasi.

Teks tiket yang dapat disalin sendiri kepada support:

> Domain sdj-rumah-kepemimpinan.my.id sudah diklaim dan tampil di CWP, tetapi pemeriksaan DNS publik mengembalikan SERVFAIL/No Reachable Authority, dengan REFUSED dari nameserver otoritatif. Mohon periksa aktivasi domain, delegasi nameserver registrar, dan zone DNS hosting untuk domain ini. Mohon konfirmasi juga apakah paket saya mendukung Node.js 24.16, SSH, proses background yang terus berjalan, outbound WebSocket WhatsApp, dan penyimpanan sesi persisten.

Tiket belum dikirim otomatis.

## 2. Periksa kemampuan aplikasi di panel

1. Pada dashboard CWP, klik **More** pada sidebar jika perlu dan buka bagian **Addons**, **Scripts**, atau daftar fitur aplikasi.
2. Cari **Node.js**, **Node.js Selector**, **Setup Node.js App**, **Application Manager**, **SSH**, atau **Terminal**. Nama ini adalah kata pencarian; belum dikonfirmasi tersedia pada paket pengguna.
3. Jika ada menu Node.js, catat versi yang tersedia, cara menjalankan aplikasi, dukungan environment variables, batas RAM, dan kebijakan idle/restart.
4. Untuk worker/OpenClaw, konfirmasi bahwa proses berkelanjutan di luar HTTP request diizinkan. Cron berkala tidak menggantikan gateway WhatsApp yang harus tetap terhubung.
5. Jika hanya PHP/File Manager, lanjutkan pemasangan halaman statis dan gunakan server backend terpisah. Jangan mengunggah `.env`, seluruh repo, atau `.local/openclaw-state` ke document root publik.

## 3. Paket website publik

Bangun ulang dari folder project:

```powershell
pnpm export:shared-hosting
```

Perintah membuat direktori baru di `.local/deployment/shared-hosting-*/public_html` dan hanya menulis empat file berikut, tanpa membaca `.env`:

```text
index.html
privacy/index.html
terms/index.html
.htaccess
```

Paket ZIP siap unggah ada di `.local/deployment/sdj-public-website.zip` setelah proses packaging. ZIP tersebut hanya untuk halaman informasi; tidak mengaktifkan login Google, pencatatan, atau gateway.

Urutan pemasangan melalui panel:

1. Klik **File Management → File Manager**.
2. Buka document root domain yang ditampilkan panel. Umumnya `public_html`; pastikan foldernya untuk domain SDJ yang benar.
3. Periksa file lama sebelum menimpa. Jika sudah ada website, unduh backup/arsipkan melalui cara pemulihan panel terlebih dahulu.
4. Pilih **Upload** dan unggah ZIP. Pilih **Extract** di document root. Isi ZIP sudah langsung berisi `index.html`, `privacy/`, `terms/`, `.htaccess`, tanpa folder `public_html` pembungkus.
5. Jika `index.php` atau `.htaccess` website lama mengambil alih routing, tinjau dan gabungkan konfigurasinya. Jangan menghapus website lama secara buta. `.htaccess` paket menambahkan header dan DirectoryIndex, tidak memaksa redirect HTTPS sebelum sertifikat tersedia.
6. Buka **Domains → AutoSSL**, pilih domain SDJ dan hostname www bila dipakai, lalu ikuti penerbitan sertifikat. Validasi domain harus sudah berhasil. Nama tombol penerbitan perlu dicocokkan dengan tampilan panel aktual.
7. Setelah HTTPS benar, periksa root, `/privacy/`, dan `/terms/` melalui koneksi luar. Pastikan sertifikat valid dan tautan antarhalaman bekerja.

Kebijakan privasi mengikuti deployment aktif saat ekspor, yang saat checkpoint masih memakai komputer pengelola/ngrok untuk penghubungan. Perbarui keterangan penyedia/hosting tersebut ketika backend benar-benar dipindahkan. Jangan mengklaim backend sudah berjalan di Diskon.com hanya karena homepage tersedia.

## 4. Rancangan aplikasi lengkap

| Hostname | Tujuan |
| --- | --- |
| `sdj-rumah-kepemimpinan.my.id` | Halaman publik di Diskon.com |
| `app.sdj-rumah-kepemimpinan.my.id` | API/onboarding pada server Linux Node.js yang dipilih |
| Jaringan internal backend | Worker, maintenance, bridge, dan gateway tanpa port administrasi publik |
| Supabase utama | Database tetap dengan role/RLS yang sudah ada |

Subdomain app belum dibuat, DNS belum diubah, server backend belum disediakan. Bila penyedia mengonfirmasi semua kemampuan runtime dalam satu hosting, rancangan dapat disesuaikan setelah diuji. Jika tetap hosting PHP, pilihan gratis backend yang sebelumnya dibahas adalah Oracle Always Free, bergantung akun, kapasitas, serta hasil uji ARM.

Saat server backend tersedia:

1. Siapkan runtime Linux, dependencies yang dipin, volume sesi, secret utama, supervisi/restart, dan HTTPS. Key enkripsi/lookup yang sudah digunakan database harus dipertahankan atau dimigrasikan dengan sengaja.
2. Arahkan DNS app ke server baru dan verifikasi HTTPS.
3. Tetapkan `PUBLIC_BASE_URL=https://app.sdj-rumah-kepemimpinan.my.id` pada backend utama. Ini baru dilakukan setelah host tersebut berfungsi.
4. Atur Google OAuth origin `https://app.sdj-rumah-kepemimpinan.my.id` dan callback `https://app.sdj-rumah-kepemimpinan.my.id/connect/google/callback`. Pada key Picker, tambahkan `https://app.sdj-rumah-kepemimpinan.my.id/*` dan pertahankan `https://docs.google.com/*`.
5. Branding memakai homepage root domain, privasi `/privacy/`, ketentuan `/terms/`; Authorized domains memakai domain registrasi `sdj-rumah-kepemimpinan.my.id`, bukan URL callback. Penuhi verifikasi kepemilikan/publikasi yang diminta Google.
6. Hentikan gateway lokal sebelum mengaktifkan sesi yang sama di server baru. Verifikasi dua peserta, pencatatan/readback, restart dan persistensi sesi.
7. Hentikan ngrok setelah alur baru benar-benar lulus. Jangan menukar PUBLIC_BASE_URL ke domain yang DNS/backend-nya belum siap.

## Batas akses saat checkpoint

Alat kontrol browser tersedia tetapi inventory mengembalikan **Local browser use is disabled in Work settings**, tanpa browser/panel yang dapat dikendalikan. Tidak ada kredensial panel, SSH, atau SFTP yang digunakan. Upload, penerbitan SSL, perubahan DNS, dan deploy backend belum dilakukan. Screenshot bukan bukti koneksi aktif ke panel atau izin API administratif.
