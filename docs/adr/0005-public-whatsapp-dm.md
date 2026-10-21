# ADR 0005: DM WhatsApp tanpa pairing code peserta

Tanggal: 17 Oktober 2026. Status: mengikuti permintaan eksplisit pemilik proyek.

Semua nomor boleh memulai DM. OpenClaw memakai `dmPolicy: open` dan `allowFrom: ["*"]` pada kanal WhatsApp serta akun utama. Launcher mengubah konfigurasi utama yang sudah ada, bukan hanya default saat instalasi. Sesi WhatsApp bot, credential, dan identitas operator dipertahankan. Pairing QR untuk ponsel bot berbeda dari pairing code peserta; hanya persyaratan pairing code peserta yang dihapus.

Pembukaan akses kanal tidak mengaktifkan tracker atau AI secara otomatis. Identitas peserta tetap berasal dari metadata kanal tepercaya. Backend memerlukan aktivasi tracker melalui login Google, pemilihan file/tab, serta konfirmasi pada DM asal sebelum membaca/menulis isian. Persetujuan pemrosesan AI tetap per peserta. Tidak ada perubahan role, RLS, schema, atau pemilihan tracker dari isi pesan.

Grup tetap disabled dan scope sesi `per-account-channel-peer`. Karena allowlist kanal sekarang wildcard, command allowlist WhatsApp gateway dibuat eksplisit kosong agar akses DM tidak memberikan akses perintah native/admin gateway. Perintah SDJ biasa diteruskan melalui bridge yang sama. Administrasi gateway tetap dari CLI.

Kontrak mode open diverifikasi dari dokumentasi resmi WhatsApp OpenClaw, schema/validator versi terpasang 2026.10.3, dan `config validate`. Regression test mencakup migrasi konfigurasi existing beserta account override, idempotensi, preservasi credential/owner, dan nomor baru yang dapat mendaftar tetapi belum dapat mencatat sebelum aktivasi Google. Uji DM nyata dari nomor yang belum pernah disetujui merupakan pemeriksaan operasional berikutnya.
