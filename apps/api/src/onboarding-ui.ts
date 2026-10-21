import { readFileSync } from 'node:fs';

export const onboardingAssets = new Map(
  [
    ['rumah-kepemimpinan.png', 'image/png'],
    ['sdj-mascot.png', 'image/png'],
    ['jakarta-regular.ttf', 'font/ttf'],
    ['jakarta-bold.ttf', 'font/ttf'],
    ['jakarta-extra-bold.ttf', 'font/ttf'],
    ['onboarding.css', 'text/css; charset=utf-8'],
  ].map(([name, type]) => [
    name!,
    { type: type!, body: readFileSync(new URL('../assets/' + name, import.meta.url)) },
  ])
);

const icon = (content: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
export const arrowIcon = icon('<path d="M5 12h14m-6-6 6 6-6 6"/>');
export const sheetIcon = icon('<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h8M12 12v7"/>');
export const lockIcon = icon(
  '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>'
);
export const checkIcon = icon('<path d="m6 12 4 4 8-8"/>');
export const clockIcon = icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
const googleIcon = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.2H24v8h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.8 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2a12.3 12.3 0 0 1-18.3-6.4H5.6v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.5 27.5a12.2 12.2 0 0 1 0-7.5v-5.3H5.6a20 20 0 0 0 0 18.1Z"/><path fill="#EA4335" d="M24 11.8c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 3.5 20.4 20.4 0 0 0 5.6 14.7l6.9 5.3A12.2 12.2 0 0 1 24 11.8Z"/></svg>`;

export function registrationShell(content: string, script = ''): string {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#254492"><meta name="robots" content="noindex,nofollow"><title>Daftar · SDJ Assistant</title><link rel="preload" href="/connect/assets/jakarta-regular.ttf" as="font" type="font/ttf" crossorigin><link rel="stylesheet" href="/connect/assets/onboarding.css"></head><body>
  <a class="skip-link" href="#pendaftaran">Lewati ke pendaftaran</a>
  <header class="topbar"><a class="brand" href="/" aria-label="SDJ Assistant — Rumah Kepemimpinan"><img src="/connect/assets/rumah-kepemimpinan.png" width="53" height="53" alt="Rumah Kepemimpinan"><span class="brand-name">SDJ Assistant<small>Rumah Kepemimpinan</small></span></a><nav aria-label="Navigasi pendaftaran"><a class="active" href="#pendaftaran" aria-current="page">Daftar</a><a class="about-link" href="#cara-kerja">Cara kerja</a></nav></header>
  <main class="page-wrap"><section class="intro" aria-labelledby="page-title"><span class="eyebrow">Spiritual Development Journey</span><h1 id="page-title">Kebiasaan <span class="accent">baik,</span><br>dimulai dari sini.</h1><p>Hubungkan tracker pribadimu. Catat aktivitas dan lihat progres, cukup lewat percakapan WhatsApp.</p></section>
  <div class="onboarding-grid"><section class="form-panel" id="pendaftaran" aria-labelledby="form-title">${content}</section>
  <aside class="mascot-stage" aria-label="Maskot SDJ Assistant"><p class="hello">Halo, aku <strong>teman SDJ-mu!</strong></p><span class="little-star" aria-hidden="true">✳</span><img class="mascot" src="/connect/assets/sdj-mascot.png" alt="Maskot SDJ berwarna biru dengan selendang merah, tersenyum sambil mengangkat jempol" width="640" height="640"><div class="sample-note"><small>Nanti, tinggal bilang…</small><p>“Catat subuh 3, tilawah 2 halaman.”</p></div></aside></div>
  <section class="how-it-works" id="cara-kerja" aria-label="Cara menghubungkan tracker"><div class="how-item"><span class="how-number">01</span><div><h3>Masuk dengan Google</h3><p>Gunakan akun yang punya akses<br>ke tracker pribadimu.</p></div></div><div class="how-item"><span class="how-number">02</span><div><h3>Pilih tracker SDJ</h3><p>Pilih file dan tab. Kami periksa<br>strukturnya secara otomatis.</p></div></div><div class="how-item"><span class="how-number">03</span><div><h3>Konfirmasi di WhatsApp</h3><p>Aktifkan dari nomormu sendiri.<br>Setelah itu, siap mencatat.</p></div></div></section>
  <footer class="site-footer"><p>Langkah kecil hari ini, bekal baik untuk esok. · Rumah Kepemimpinan</p><nav aria-label="Informasi layanan"><a href="/privacy">Privasi</a><a href="/terms">Ketentuan</a><a href="/">Tentang SDJ</a></nav></footer></main>${script ? `<script src="${script}" defer></script>` : ''}</body></html>`;
}

export function connectionPage(): string {
  return registrationShell(
    `<ol class="steps" aria-label="Tahap pendaftaran"><li id="step-google" class="current" aria-current="step"><span class="step-number">1</span>Google</li><li id="step-sheet"><span class="step-number">2</span>Tracker</li><li id="step-confirm"><span class="step-number">3</span>Konfirmasi</li></ol>
    <div id="google-panel"><p class="form-kicker">Mulai perjalananmu</p><h2 id="form-title">Hubungkan tracker pribadi</h2><p class="form-description">Masuk dengan akun Google yang memiliki tracker SDJ-mu. Pilihan file tetap ada di tanganmu.</p><button class="btn btn-google" id="google" type="button">${googleIcon}Hubungkan akun Google</button></div>
    <div id="sheet-panel" hidden><p class="form-kicker">Google sudah terhubung</p><h2 id="sheet-title">Pilih tracker SDJ-mu</h2><p class="form-description">Pilih file Google Sheets, lalu tab berisi aktivitas harian. Pastikan file milikmu dan dapat diedit.</p><div class="inline-help">${lockIcon}<span>Akses hanya ke file yang kamu pilih, bukan seluruh isi Google Drive.</span></div><button class="btn btn-secondary" id="picker" type="button">${sheetIcon}Pilih Google Sheet</button><p id="file-name" class="file-name" hidden></p><div id="tab-field" hidden><label class="field-label" for="tabs">Tab tracker</label><select id="tabs"><option value="">Pilih tab tracker</option></select><p class="form-description">Semua input akan mengikuti aturan SDJ. Isian yang jelas dikonversi; isian yang tidak dapat dipastikan dikosongkan. Rumus pada sel input diganti dengan hasilnya bila valid. Nilai, rumus, dan aturan asal dicadangkan di tab tersembunyi pada file ini. Rumus rekap, target, dan tampilan dipertahankan. Proses berlanjut otomatis; perbaikan tetap berlaku meskipun penghubungan dibatalkan.</p><button class="btn btn-primary validate-button" id="select" type="button">Validasi &amp; perbaiki${arrowIcon}</button></div></div>
    <div id="confirmation-panel" hidden><div class="confirmation-icon">${checkIcon}</div><p class="form-kicker">Tinggal satu langkah</p><h2 id="confirmation-title">Lanjutkan di WhatsApp</h2><p class="form-description">Konfirmasi tracker sudah dikirim ke percakapan WhatsApp tempat kamu mendaftar.</p><p class="confirm-guide">Periksa ringkasannya, lalu kirim <code>hubungkan KODE</code> sesuai pesan bot. Setelah bot menyatakan terhubung, kamu bisa mulai mencatat.</p></div>
    <div id="consent-panel" class="consent"><label class="consent-label" for="ai"><input id="ai" type="checkbox"><span>Izinkan AI memahami bahasamu <span class="optional">OPSIONAL</span></span></label><details><summary>Tentang izin pemrosesan AI</summary><p>Aku mengizinkan pesan dan konteks yang diperlukan diproses oleh layanan AI eksternal untuk memahami instruksi. Daftar layanan dan detail pemrosesan tersedia pada <a href="/privacy" target="_blank" rel="noopener">kebijakan privasi</a>. Token Google dan identitas peserta tidak ditambahkan ke permintaan AI. Informasi pribadi yang aku ketik di pesan dapat ikut diproses. Tanpa izin ini, perintah singkat seperti “subuh 3” tetap tersedia.</p></details></div><p class="fine-print">Nama profil Google digunakan untuk sapaan jika tersedia. Pengingat SDJ pukul 07.00, 13.00, dan 20.00 WIB dapat dihentikan dengan mengirim “reminder mati”.</p>
    <p id="status" class="status" role="status" aria-live="polite" aria-atomic="true"></p><button class="cancel-button" id="cancel" type="button">Batalkan penghubungan</button><p class="fine-print">Baca <a href="/privacy">Kebijakan Privasi</a> dan <a href="/terms">Ketentuan Penggunaan</a> sebelum login Google. Selesaikan di browser yang sama.</p>`,
    '/connect/client.js'
  );
}
