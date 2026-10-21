// Served as an external script so onboarding keeps a restrictive script CSP.
export const clientScript = String.raw`
const $ = selector => document.querySelector(selector);
const status = $('#status');
let fileId = '', busy = false, pickerLoaded;
const csrf = () => document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('sdj_csrf='))?.slice(9) || '';
function announce(message, tone = '') {
  status.textContent = message;
  status.setAttribute('data-tone', tone);
}
function stage(name) {
  const sheet = name === 'file_selection', confirmation = name === 'channel_confirmation';
  $('#google-panel').hidden = sheet || confirmation;
  $('#sheet-panel').hidden = !sheet;
  $('#confirmation-panel').hidden = !confirmation;
  $('#consent-panel').hidden = confirmation;
  $('#pendaftaran').setAttribute('aria-labelledby', confirmation ? 'confirmation-title' : sheet ? 'sheet-title' : 'form-title');
  ['google', 'sheet', 'confirm'].forEach((id, index) => {
    const step = $('#step-' + id), current = confirmation ? 2 : sheet ? 1 : 0;
    step.className = index === current ? 'current' : index < current ? 'done' : '';
    if (index === current) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  });
}
async function api(path, body) {
  const r = await fetch(path, {method: body === undefined ? 'GET' : 'POST', headers: {'content-type': 'application/json', 'x-sdj-csrf': csrf()}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const data = await r.json();
  if (!r.ok) { const error = new Error(data.error?.message || 'Permintaan gagal.'); error.status = r.status; error.code = data.error?.code; throw error; }
  return data;
}
async function run(fn) {
  if (busy) return;
  busy = true;
  $('#pendaftaran').setAttribute('aria-busy', 'true');
  ['google', 'picker', 'select', 'cancel'].forEach(id => { $('#' + id).disabled = true; });
  announce('Memproses…');
  try { await fn(); }
  catch (e) { announce(e.message || 'Belum berhasil. Coba kembali.', 'error'); }
  finally {
    busy = false;
    $('#pendaftaran').setAttribute('aria-busy', 'false');
    ['google', 'picker', 'select', 'cancel'].forEach(id => { $('#' + id).disabled = false; });
  }
}
$('#google').onclick = () => run(async () => {
  const r = await api('/connect/google/start', {allow_ai: $('#ai').checked});
  location.assign(r.url);
});
function loadPicker() {
  if (!pickerLoaded) pickerLoaded = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => gapi.load('picker', {callback: resolve, onerror: reject});
    script.onerror = reject;
    document.head.append(script);
  }).catch(() => { pickerLoaded = undefined; throw new Error('Google Picker belum dapat dimuat. Periksa koneksi, lalu coba lagi.'); });
  return pickerLoaded;
}
$('#picker').onclick = () => run(async () => {
  const config = await api('/connect/picker');
  await loadPicker();
  const picker = new google.picker.PickerBuilder()
    .addView(new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS))
    .setOAuthToken(config.accessToken).setDeveloperKey(config.apiKey).setAppId(config.appId).setOrigin(location.origin)
    .setCallback(data => {
      if (data.action !== google.picker.Action.PICKED) return;
      void run(async () => {
        fileId = '';
        $('#tab-field').hidden = true;
        $('#file-name').hidden = true;
        const file = data.docs?.[0];
        if (!file?.id) throw new Error('File belum terpilih. Buka Google Picker kembali.');
        const r = await api('/connect/tabs', {spreadsheet_id: file.id});
        const select = $('#tabs');
        select.replaceChildren();
        for (const tab of r.tabs) {
          const option = document.createElement('option');
          option.value = String(tab.id); option.textContent = tab.title; select.append(option);
        }
        if (!r.tabs.length) throw new Error('File ini belum memiliki tab tracker. Pilih file lain.');
        clearRepair();
        fileId = file.id;
        $('#file-name').textContent = file.name || 'File Google Sheets terpilih';
        $('#file-name').hidden = false;
        $('#tab-field').hidden = false;
        announce('Pilih tab berisi aktivitas SDJ-mu, lalu tekan validasi.');
      });
    }).build();
  picker.setVisible(true);
  announce('Pilih file Google Sheets pada jendela Google Picker.');
});
const repairStorage = 'sdjTrackerRepairV1';
function savedRepair() {
  try { const saved = JSON.parse(sessionStorage.getItem(repairStorage) || 'null'); return saved && typeof saved.spreadsheet_id === 'string' && Number.isInteger(saved.sheet_id) && typeof saved.allow_ai === 'boolean' ? saved : null; } catch { return null; }
}
function saveRepair(value) { try { sessionStorage.setItem(repairStorage, JSON.stringify(value)); } catch {} }
function clearRepair() { try { sessionStorage.removeItem(repairStorage); } catch {} }
async function completeRepair(body) {
  body = {...body, repair_version: 1};
  let failures = 0;
  saveRepair(body);
  for (;;) {
    let r;
    try { r = await api('/connect/tracker', body); }
    catch (error) {
      if (error.code === 'ONBOARDING_STATE_INVALID') {
        const status = await api('/connect/status');
        if (status.status === 'channel_confirmation') {
          clearRepair(); stage('channel_confirmation');
          announce('Perbaikan selesai. Kode konfirmasi sudah dikirim; lanjutkan dari DM WhatsApp asal.', 'success');
          return;
        }
      }
      if ([400, 401, 403].includes(error.status)) { clearRepair(); throw error; }
      if (++failures > 5) throw new Error('Koneksi sedang terganggu. Progres tersimpan; tekan validasi kembali atau muat ulang untuk melanjutkan.');
      announce('Memeriksa hasil perubahan dan menyambungkan kembali…');
      await new Promise(resolve => setTimeout(resolve, Math.min(8000, 500 * 2 ** failures)));
      continue;
    }
    if (r.repairing) {
      body = {...body, continuation_token: r.continuationToken};
      saveRepair(body);
      const counts = r.progress || {};
      announce('Memperbaiki tracker otomatis… ' + ((counts.repairedValidationCells || 0) + (counts.resetInputCells || 0) + (counts.convertedInputCells || 0)) + ' perubahan terverifikasi. Tetap buka halaman ini.');
      failures = r.retrying ? failures + 1 : 0;
      if (failures > 5) throw new Error('Google belum merespons. Progres tersimpan; muat ulang untuk melanjutkan tanpa mengubah spreadsheet manual.');
      if (r.retryAfterMs) announce('Google sedang membatasi permintaan. Progres tersimpan dan proses akan dilanjutkan otomatis…');
      await new Promise(resolve => setTimeout(resolve, r.retryAfterMs ? Math.min(61000, Math.max(150, r.retryAfterMs)) : r.retrying ? Math.min(8000, 500 * 2 ** failures) : 150));
      continue;
    }
    clearRepair();
    stage('channel_confirmation');
    announce((r.configuration ? 'Pemetaan otomatis selesai: ' + r.configuration.activityCount + ' aktivitas, ' + r.configuration.dateCount + ' tanggal (' + r.configuration.dateFrom + ' s.d. ' + r.configuration.dateTo + ').\n' + (r.configuration.repairedValidationCells ? 'Aturan input pada ' + r.configuration.repairedValidationCells + ' sel disesuaikan.\n' : '') + (r.configuration.convertedInputCells ? r.configuration.convertedInputCells + ' isian dikonversi ke tipe yang benar.\n' : '') + (r.configuration.resetInputCells ? r.configuration.resetInputCells + ' isian yang tidak dapat dipastikan dikosongkan.\n' : '') + ((r.configuration.repairedValidationCells || r.configuration.convertedInputCells || r.configuration.resetInputCells) ? 'Nilai dan aturan asal tersedia di tab cadangan tersembunyi pada file ini.\n' : '') : '') + 'Kirim kode konfirmasi dari DM WhatsApp asal untuk mengaktifkan koneksi.', 'success');
    return;
  }
}
$('#select').onclick = () => run(async () => {
  const saved = savedRepair();
  if (!fileId || !$('#tabs').value) {
    if (saved) return completeRepair(saved);
    throw new Error('Pilih file dan tab tracker terlebih dahulu.');
  }
  const body = {spreadsheet_id: fileId, sheet_id: Number($('#tabs').value), allow_ai: $('#ai').checked};
  return completeRepair(saved && saved.spreadsheet_id === fileId && saved.sheet_id === body.sheet_id ? {...body, ...(saved.continuation_token ? {continuation_token: saved.continuation_token} : {})} : body);
});
$('#cancel').onclick = () => run(async () => {
  await api('/connect/cancel', {});
  clearRepair();
  stage('channel_confirmation');
  $('#confirmation-title').textContent = 'Penghubungan dibatalkan';
  $('#confirmation-panel .form-kicker').textContent = 'Sesi selesai';
  $('#confirmation-panel .form-description').textContent = 'Tidak ada tracker baru yang diaktifkan dari sesi ini. File Google Sheets-mu tetap ada.';
  $('#confirmation-panel .confirm-guide').textContent = 'Untuk mulai kembali, kirim daftar satu kali ke bot WhatsApp dan buka tautan terbaru.';
  $('#cancel').hidden = true;
  announce('Sesi dibatalkan.');
});
void run(async () => {
  const r = await api('/connect/status');
  $('#ai').checked = r.ai_allowed;
  stage(r.status);
  if (r.status === 'channel_confirmation') clearRepair();
  const saved = savedRepair();
  if (r.status === 'file_selection' && saved) { await completeRepair(saved); return; }
  announce(r.status === 'channel_confirmation' ? 'Kode konfirmasi sudah dikirim. Lanjutkan dari DM WhatsApp asal.' : r.status === 'file_selection' ? 'Akun Google terhubung. Sekarang pilih tracker pribadimu.' : 'Siap menghubungkan akun Google.');
});
`;
