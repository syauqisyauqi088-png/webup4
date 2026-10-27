(() => {
  const MEMBERS = [
    { id: 'adimas',   name: 'Adimas',   photo: 'assets/anjus.jpeg' },
    { id: 'ananda',   name: 'Ananda',   photo: 'assets/vianganteng.jpg' },
    { id: 'fadya',    name: 'Fadya',    photo: 'assets/fadya.foto.jpeg' },
    { id: 'guntur',   name: 'Guntur',   photo: 'assets/gunturff.jpeg' },
    { id: 'jarvis',   name: 'Jarvis',   photo: 'assets/profilej.jpeg' },
    { id: 'maysyita', name: 'Maysyita', photo: 'assets/maysita.jpeg' },
    { id: 'syena',    name: 'Syena',    photo: '' },
  ];
  const SLOTS = 6;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const CFG = window.CERT_CONFIG && window.CERT_CONFIG.token_enc ? window.CERT_CONFIG : null;
  const JSON_PATH = 'data/sertifikat.json';
  const DIR = 'assets/sertifikat/';
  const API = CFG ? `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/` : '';

  let certs = {};
  let current = (location.hash || '').slice(1);
  if (!MEMBERS.some((m) => m.id === current)) current = MEMBERS[0].id;
  let token = ''; // token GitHub hasil dekripsi, hanya di memori

  const tabs = $('#certTabs'), panel = $('#certPanel');
  let uploadModal, pwModal, lightbox;

  /* ---------- kripto: password membuka token GitHub ---------- */
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function decryptToken(password) {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64d(CFG.salt), iterations: 250000, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    try {
      const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(CFG.iv) }, key, b64d(CFG.token_enc));
      return new TextDecoder().decode(buf);
    } catch { throw new Error('Password salah.'); }
  }

  /* ---------- GitHub API ---------- */
  async function gh(path, opts = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        ...opts, cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
                   'Content-Type': 'application/json', ...(opts.headers || {}) },
      });
    } catch { throw new Error('Tidak bisa terhubung ke GitHub.'); }
    let body = {}; try { body = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(res.status === 401 || res.status === 403
        ? 'Token GitHub ditolak (kedaluwarsa / izin kurang). Buat token baru lewat setup-token.html.'
        : body.message || 'Terjadi kesalahan.');
      err.status = res.status; throw err;
    }
    return body;
  }
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  const utf8b64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
  const b64utf8 = (b64) => new TextDecoder().decode(b64d(b64.replace(/\n/g, '')));

  async function readJson() { // data terbaru + sha, langsung dari repo
    try {
      const f = await gh(enc(JSON_PATH) + '?ref=' + encodeURIComponent(CFG.branch));
      return { data: JSON.parse(b64utf8(f.content) || '{}'), sha: f.sha };
    } catch (e) { if (e.status === 404) return { data: {}, sha: undefined }; throw e; }
  }
  async function writeJson(data, sha, msg) {
    return gh(enc(JSON_PATH), { method: 'PUT', body: JSON.stringify({
      message: msg, branch: CFG.branch, sha, content: utf8b64(JSON.stringify(data, null, 2) + '\n') }) });
  }
  // baca-ubah-tulis json, ulangi sekali kalau ada bentrokan (409)
  async function updateJson(mutate, msg) {
    for (let i = 0; i < 2; i++) {
      const { data, sha } = await readJson();
      mutate(data);
      try { await writeJson(data, sha, msg); return data; }
      catch (e) { if (e.status !== 409 || i) throw e; }
    }
  }

  function toJpegBase64(file) { // kecilkan foto biar repo tidak berat
    return new Promise(async (resolve, reject) => {
      try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(bmp, 0, 0, c.width, c.height);
        c.toBlob((blob) => {
          if (!blob) return reject(new Error('Gagal memproses gambar.'));
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(',')[1]);
          r.readAsDataURL(blob);
        }, 'image/jpeg', 0.85);
      } catch { reject(new Error('File bukan gambar yang valid.')); }
    });
  }
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

  function avatar(m) {
    if (m.photo) {
      const img = el('img', 'cert-avatar');
      img.src = m.photo; img.alt = '';
      img.onerror = () => img.replaceWith(initial(m));
      return img;
    }
    return initial(m);
  }
  const initial = (m) => el('span', 'cert-avatar', m.name[0]);

  function toast(msg) {
    const t = $('#certToast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000);
  }

  async function load() {
    let data = null;
    if (CFG) { // data terbaru langsung dari repo (tanpa menunggu deploy Pages)
      try {
        const r = await fetch(API + enc(JSON_PATH) + '?ref=' + encodeURIComponent(CFG.branch),
          { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
        if (r.ok) data = await r.json();
      } catch {}
    }
    if (!data) {
      try { const r = await fetch(JSON_PATH + '?v=' + Date.now()); if (r.ok) data = await r.json(); } catch {}
    }
    certs = data || {};
    render();
  }

  function renderTabs() {
    tabs.replaceChildren();
    MEMBERS.forEach((m) => {
      const b = el('button', 'cert-tab' + (m.id === current ? ' active' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', m.id === current);
      b.append(avatar(m), el('span', '', m.name),
        el('span', 'cert-tab-count', `${(certs[m.id] || []).length}/${SLOTS}`));
      b.onclick = () => { current = m.id; history.replaceState(null, '', '#' + m.id); render(); };
      tabs.append(b);
    });
  }

  function render() {
    renderTabs();
    const m = MEMBERS.find((x) => x.id === current);
    const list = certs[m.id] || [];
    panel.replaceChildren();

    const head = el('div', 'cert-head');
    const who = el('div', 'cert-who');
    const info = el('div');
    info.append(el('h2', '', m.name), el('p', '', `${list.length} dari ${SLOTS} sertifikat`));
    who.append(avatar(m), info);
    const up = el('button', 'cert-btn', '＋ Upload Sertifikat');
    up.type = 'button'; up.disabled = list.length >= SLOTS;
    up.title = up.disabled ? 'Slot penuh (maks 6)' : '';
    up.onclick = openUpload;
    head.append(who, up);

    const grid = el('div', 'cert-grid');
    list.forEach((c, i) => {
      const card = el('article', 'cert-card');
      card.style.animationDelay = i * 60 + 'ms';
      const img = el('img', 'cert-thumb');
      img.src = DIR + encodeURIComponent(c.file);
      img.onerror = () => { // belum ter-deploy? pakai langsung dari repo
        img.onerror = null;
        if (CFG) img.src = `https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/${CFG.branch}/${DIR}${encodeURIComponent(c.file)}`;
      };
      img.alt = `Sertifikat ${i + 1} milik ${m.name}`;
      img.loading = 'lazy';
      img.onclick = () => openLightbox(img.src, c.description);
      const body = el('div', 'cert-body');
      body.append(el('div', 'cert-num', `Sertifikat ${String(i + 1).padStart(2, '0')}`));
      body.append(c.description ? el('p', 'cert-desc', c.description)
                                : el('p', 'cert-desc muted', 'Tanpa deskripsi'));
      const del = el('button', 'cert-del', '🗑');
      del.type = 'button'; del.title = 'Hapus sertifikat'; del.setAttribute('aria-label', 'Hapus sertifikat');
      del.onclick = () => removeCert(c);
      card.append(img, body, del);
      grid.append(card);
    });
    for (let i = list.length; i < SLOTS; i++) {
      const s = el('button', 'cert-slot');
      s.type = 'button';
      s.append(el('span', 'plus', '＋'), el('span', '', `Slot ${i + 1} kosong`));
      s.onclick = openUpload;
      grid.append(s);
    }
    panel.append(head, grid);
  }

  function openLightbox(src, desc) {
    $('#lightImg').src = src;
    $('#lightDesc').textContent = desc || '';
    lightbox.show();
  }

  /* ---- alur password -> form upload ---- */
  let afterPw = null;
  function askPassword(next) {
    if (!CFG) { toast('Upload belum dikonfigurasi — jalankan setup-token.html dulu.'); return; }
    if (token) return next();
    afterPw = next;
    $('#pwInput').value = ''; $('#pwError').textContent = '';
    pwModal.show();
    $('#pwModal').addEventListener('shown.bs.modal', () => $('#pwInput').focus(), { once: true });
  }

  async function submitPassword(e) {
    e.preventDefault();
    const btn = $('#pwSubmit');
    btn.disabled = true; $('#pwError').textContent = '';
    try {
      token = await decryptToken($('#pwInput').value);
      const next = afterPw; afterPw = null;
      pwModal.hide();
      $('#pwModal').addEventListener('hidden.bs.modal', () => next && next(), { once: true });
    } catch (err) { $('#pwError').textContent = err.message; }
    btn.disabled = false;
  }

  function openUpload() {
    askPassword(() => {
      const m = MEMBERS.find((x) => x.id === current);
      $('#upTitle').textContent = `Upload Sertifikat — ${m.name}`;
      $('#upForm').reset();
      $('#upPreview').classList.remove('show');
      $('#upError').textContent = '';
      uploadModal.show();
    });
  }

  async function submitUpload(e) {
    e.preventDefault();
    const file = $('#upPhoto').files[0];
    if (!file) { $('#upError').textContent = 'Foto sertifikat wajib diisi.'; return; }
    if (file.size > 15 * 1024 * 1024) { $('#upError').textContent = 'Ukuran file maksimal 15 MB.'; return; }
    const member = current, desc = $('#upDesc').value.trim().slice(0, 200);
    const btn = $('#upSubmit');
    btn.disabled = true; btn.textContent = 'Mengunggah…'; $('#upError').textContent = '';
    try {
      const b64 = await toJpegBase64(file);
      const name = `${member}-${rid()}.jpg`;
      const fresh = (await readJson()).data;
      if ((fresh[member] || []).length >= SLOTS) throw new Error('Slot sertifikat sudah penuh (maks 6). Hapus salah satu dulu.');
      await gh(enc(DIR + name), { method: 'PUT', body: JSON.stringify({
        message: `Tambah sertifikat ${member}`, branch: CFG.branch, content: b64 }) });
      const cert = { id: rid(), file: name, description: desc, uploadedAt: new Date().toISOString() };
      certs = await updateJson((d) => {
        d[member] = d[member] || [];
        if (d[member].length >= SLOTS) throw new Error('Slot sertifikat sudah penuh (maks 6).');
        d[member].push(cert);
      }, `Data sertifikat ${member}`);
      uploadModal.hide(); render();
      toast('Sertifikat tersimpan ✓ (muncul untuk semua orang setelah situs ter-deploy ±1 menit)');
    } catch (err) {
      $('#upError').textContent = err.message;
      if (err.status === 401 || err.status === 403) token = '';
    }
    btn.disabled = false; btn.textContent = 'Upload';
  }

  function removeCert(c) {
    askPassword(async () => {
      if (!confirm('Hapus sertifikat ini?')) return;
      try {
        certs = await updateJson((d) => {
          d[current] = (d[current] || []).filter((x) => x.id !== c.id);
        }, `Hapus data sertifikat ${current}`);
        try { // hapus file gambarnya juga
          const f = await gh(enc(DIR + c.file) + '?ref=' + encodeURIComponent(CFG.branch));
          await gh(enc(DIR + c.file), { method: 'DELETE', body: JSON.stringify({
            message: `Hapus file sertifikat ${current}`, branch: CFG.branch, sha: f.sha }) });
        } catch {}
        render(); toast('Sertifikat dihapus');
      } catch (err) {
        if (err.status === 401 || err.status === 403) token = '';
        toast(err.message);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    uploadModal = new bootstrap.Modal('#upModal');
    pwModal = new bootstrap.Modal('#pwModal');
    lightbox = new bootstrap.Modal('#lightModal');
    $('#pwForm').addEventListener('submit', submitPassword);
    $('#upForm').addEventListener('submit', submitUpload);
    $('#upPhoto').addEventListener('change', (e) => {
      const f = e.target.files[0], p = $('#upPreview');
      if (!f) return p.classList.remove('show');
      p.src = URL.createObjectURL(f); p.classList.add('show');
    });
    window.addEventListener('hashchange', () => {
      const h = location.hash.slice(1);
      if (MEMBERS.some((m) => m.id === h)) { current = h; render(); }
    });
    load();
  });
})();
