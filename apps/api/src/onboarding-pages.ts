import { registrationShell, arrowIcon, clockIcon, sheetIcon, lockIcon } from './onboarding-ui.js';

export function connectionEntryPage(): string {
  return registrationShell(
    `<p class="form-kicker">Selamat datang di SDJ Assistant</p><h2 id="form-title">Tracker-mu, lebih dekat.</h2><p class="form-description">Mulai hubungkan tracker dari tautan WhatsApp-mu sendiri. Siapkan akun Google dan file SDJ, lalu lanjutkan di browser yang sama.</p><ul class="entry-list"><li>${sheetIcon}<div><strong>Catatan tetap di Google Sheets</strong><span>Kamu memilih file yang ingin dihubungkan.</span></div></li><li>${lockIcon}<div><strong>Aktivasi dari nomormu sendiri</strong><span>Konfirmasikan melalui DM WhatsApp asal.</span></div></li></ul><button class="btn btn-primary entry-button" id="begin" type="button">Lanjutkan${arrowIcon}</button><p class="entry-meta">${clockIcon}Tautan pribadi · berlaku 10 menit</p><p id="entry-status" class="status" role="status" aria-live="polite"></p><p class="fine-print">Meminta tautan beberapa kali? Gunakan balasan bot yang paling baru.<br><a href="/privacy">Privasi</a> &amp; <a href="/terms">ketentuan penggunaan</a></p><noscript>Aktifkan JavaScript pada browser untuk melanjutkan login Google.</noscript>`,
    '/connect/entry.js'
  );
}

export function connectionExpiredPage(): string {
  return registrationShell(
    `<p class="form-kicker">Mari coba kembali</p><h2 id="form-title">Mulai dari tautan terbaru</h2><p class="form-description">Tautan atau sesi ini sudah selesai, kedaluwarsa, atau telah dibuka di browser lain. Tracker yang sudah ada tetap tersimpan.</p><ol class="recovery-list"><li>Kembali ke percakapan WhatsApp dengan bot SDJ.</li><li>Kirim <strong>daftar</strong> satu kali dan tunggu balasan terbaru.</li><li>Buka tautan yang paling baru dalam 10 menit, lalu tekan <strong>Lanjutkan</strong>.</li></ol><p class="form-description">Selesaikan login dan pemilihan tracker di browser yang sama. Jika sebelumnya sudah mulai login, lanjutkan pada tab browser tersebut.</p><a class="btn btn-secondary entry-button" href="/">Kembali ke informasi SDJ${arrowIcon}</a>`
  );
}

export function profilePage(): string {
  return registrationShell(
    `<p class="form-kicker">Nama sapaan SDJ</p><h2>Perbarui profil Google</h2><p class="form-description">Masuk dengan akun Google yang sudah terhubung. Nama profil digunakan untuk sapaan pengingat. Tracker tetap terhubung.</p><button id="profile-google" class="btn btn-primary" type="button">Lanjutkan dengan Google</button><button id="profile-cancel" class="btn btn-secondary" type="button">Batal</button><p id="profile-status" class="status" role="status"></p><p class="fine-print"><a href="/privacy">Detail privasi</a></p>`,
    '/connect/profile.js'
  );
}

export function profileResultPage(success: boolean): string {
  return registrationShell(
    success
      ? '<h2>Pembaruan profil selesai</h2><p class="form-description">Nama dari Google akan dipakai jika tersedia. Kamu bisa kembali ke WhatsApp. Tracker tetap terhubung.</p>'
      : '<h2>Login dibatalkan</h2><p class="form-description">Tracker tetap terhubung. Jika ingin mencoba lagi, kirim “perbarui profil” melalui WhatsApp.</p>'
  );
}

export const profileScript = `const status=document.querySelector('#profile-status');let busy=false;const csrf=()=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('sdj_csrf='))?.slice(9)||'';async function action(path,body){if(busy)return;busy=true;try{const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-sdj-csrf':csrf()},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error?.message||'Belum berhasil.');if(d.url)location.assign(d.url);else{status.textContent='Dibatalkan. Tracker tetap terhubung.';document.querySelector('#profile-google').disabled=true;}}catch(e){status.textContent=e.message;}finally{busy=false;}}document.querySelector('#profile-google').onclick=()=>action('/connect/google/start',{allow_ai:false});document.querySelector('#profile-cancel').onclick=()=>action('/connect/cancel',{});`;

// Page loading, link previews, and script loading never consume the token.
export const entryScript = `const token=new URLSearchParams(location.search).get('token');const button=document.querySelector('#begin');const status=document.querySelector('#entry-status');button.onclick=async()=>{if(button.disabled)return;button.disabled=true;status.textContent='Membuka sesi Anda…';try{const response=await fetch('/connect/exchange',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-sdj-onboarding':'1'},body:JSON.stringify({token})});const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Sesi belum dapat dibuka. Coba kembali.');location.replace('/connect');}catch(error){status.textContent=error.message;button.disabled=false;}};`;
