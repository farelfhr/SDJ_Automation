# Halaman daftar SDJ Assistant

Desain pendaftaran memakai biru `#254492`, merah `#ed2330`, navy `#0c1c43`, putih, dan krem. Logo Rumah Kepemimpinan dan maskot berasal dari aset yang diberikan pemilik. Font Plus Jakarta Sans disajikan dari server sendiri; lisensinya tersimpan pada `apps/api/assets/FONT-LICENSE.txt`.

Lingkup hanya alur `/connect`: halaman awal tautan, login Google/persetujuan AI, pemilihan file dan tab, konfirmasi WhatsApp, serta pemulihan sesi kedaluwarsa. Homepage, privasi, dan ketentuan tetap memakai halaman yang ada.

## Komponen dan alur

- `apps/api/src/onboarding-ui.ts`: kerangka halaman, formulir, ikon dan daftar aset yang boleh disajikan.
- `apps/api/src/onboarding-pages.ts`: halaman awal, kedaluwarsa dan pertukaran token setelah klik.
- `apps/api/src/onboarding-client.ts`: langkah sesuai status sesi, Google Picker, validasi, retry dan pembatalan.
- `apps/api/assets/onboarding.css`: layout responsif, warna, font lokal, fokus keyboard, status dan reduced motion.
- `scripts/public-proxy.mjs`: daftar eksplisit aset publik; tidak membuka direktori workspace secara umum.

GET/HEAD tautan tetap tidak mengonsumsi token. Persetujuan AI tetap opsional dan dipulihkan dari sesi; deskripsi provider/pemrosesannya tersedia pada detail izin. Header CSRF, cookie sesi, OAuth dan konfirmasi DM asal tidak berubah. Saat perbaikan dimulai, konteks file/tab dan token kelanjutan terenkripsi disimpan di sessionStorage browser; refresh meneruskan otomatis selama sesi masih valid. Sebelum perbaikan dimulai, pemilihan file tetap dilakukan lewat Picker. Setelah validasi, tombol input diganti petunjuk konfirmasi DM. Halaman tidak mengklaim tracker aktif sebelum peserta mengonfirmasi di WhatsApp.

Tombol **Validasi & perbaiki** menjelaskan normalisasi lengkap sesuai [ADR 0009](../adr/0009-complete-tracker-normalization.md): konversi jelas, backup lalu clear untuk isian lain, serta penggantian rumus tepat di sel input. Cadangan disimpan di tab tersembunyi pada file yang sama; note pribadi/rumus rekap/target/tampilan dipertahankan. Browser mengirim repair_version 1 dan melanjutkan respons 202 tanpa klik tambahan, memakai backoff pada gangguan sementara; ringkasan akhir menyebut aturan, konversi dan pengosongan. Respons akhir yang hilang dipulihkan lewat status channel_confirmation. Perbaikan tetap berlaku bila onboarding dibatalkan dan tidak termasuk undo pencatatan. Jangan memakai validate/repairStep untuk probe read-only pada file nyata.

## Packaging dan verifikasi

Sertakan seluruh `apps/api/assets/` bersama source/build API pada setiap release; `tsc` tidak menyalin aset. Module membaca aset dari direktori di samping `src`/`dist`. Jangan mengunggah `.env` atau file temporary sebagai aset. Penambahan aset memerlukan entri eksplisit pada map API dan allowlist proxy.

Sebelum aktivasi: jalankan typecheck, lint, format, unit, E2E dan build; periksa preview desktop/mobile, pemilihan sheet ID nol, error validasi dan retry, ringkasan konfirmasi, batal, serta kedaluwarsa dengan fixture sintetis. Setelah deployment: cek GET/HEAD CSS, font dan gambar melalui domain, halaman tautan tanpa cookie, CSP font lokal, serta API/gateway ready. Tidak perlu mengubah database atau mengirim pesan nyata untuk pemeriksaan UI.
