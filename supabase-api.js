'use strict';
/* =====================================================
   API — adaptador Supabase (site PRIVADO)
   Só os e-mails autorizados veem o conteúdo: a página
   abre num portão de login e toda mídia é servida por
   URL assinada (buckets privados). RLS reforça tudo
   no banco — o frontend é só a primeira porta.
   ===================================================== */
window.API = (function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_LOGIN } = window.SITE_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const SIGN_TTL = 60 * 60 * 24 * 7; // 7 dias
  // name → signedUrl, por bucket. Preenchido no init() e mantido nos uploads.
  const urls = { photos: new Map(), audio: new Map() };

  const photoUrl = (file) => urls.photos.get(file) || '';
  const audioUrl = (file) => urls.audio.get(file) || '';

  // ── Portão de login (tela cheia, sem cancelar) ────────────────────────────
  function loginScreen() {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.id = 'login-gate';
      wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:linear-gradient(160deg,#FCE4EC,#F8BBD0 60%,#F48FB1);display:flex;align-items:center;justify-content:center;padding:1rem;';
      wrap.innerHTML = `
        <div style="background:#fff;border-radius:18px;max-width:350px;width:100%;padding:2rem 1.6rem;font-family:Nunito,sans-serif;text-align:center;box-shadow:0 24px 70px rgba(194,24,91,.25);">
          <div style="font-size:2.4rem;">♡</div>
          <h3 style="margin:.4rem 0 .2rem;color:#C2185B;font-size:1.1rem;">Nosso cantinho</h3>
          <p data-step-hint style="color:#666;font-size:.82rem;margin:0 0 1.2rem;">Esse site é só nosso. Confirme que é você.</p>
          <div data-step="email">
            <input data-email type="email" placeholder="seu e-mail" autocomplete="email"
              style="width:100%;padding:.65rem .8rem;border:1px solid #e5b8c8;border-radius:10px;font-size:.9rem;box-sizing:border-box;" />
            <button data-send type="button" style="width:100%;margin-top:.6rem;padding:.65rem;border:0;border-radius:10px;background:#C2185B;color:#fff;font-size:.9rem;cursor:pointer;">Receber código no e-mail</button>
            <button data-google type="button" style="width:100%;margin-top:.5rem;padding:.65rem;border:1px solid #ccc;border-radius:10px;background:#fff;font-size:.9rem;cursor:pointer;display:none;">Entrar com Google</button>
          </div>
          <div data-step="code" style="display:none;">
            <input data-code type="text" inputmode="numeric" maxlength="6" placeholder="código de 6 dígitos"
              style="width:100%;padding:.65rem .8rem;border:1px solid #e5b8c8;border-radius:10px;font-size:1.1rem;text-align:center;letter-spacing:.3em;box-sizing:border-box;" />
            <button data-verify type="button" style="width:100%;margin-top:.6rem;padding:.65rem;border:0;border-radius:10px;background:#C2185B;color:#fff;font-size:.9rem;cursor:pointer;">Entrar</button>
            <button data-back type="button" style="margin-top:.5rem;border:0;background:none;color:#999;font-size:.78rem;cursor:pointer;">usar outro e-mail</button>
          </div>
          <p data-msg style="color:#a33;font-size:.78rem;min-height:1em;margin:.8rem 0 0;"></p>
        </div>`;
      document.body.appendChild(wrap);

      const $ = (s) => wrap.querySelector(s);
      const msg = (t, ok) => { const m = $('[data-msg]'); m.textContent = t; m.style.color = ok ? '#2a7' : '#a33'; };
      let email = '';

      if (GOOGLE_LOGIN) {
        const g = $('[data-google]'); g.style.display = 'block';
        g.addEventListener('click', () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0] } }));
      }
      $('[data-send]').addEventListener('click', async () => {
        email = $('[data-email]').value.trim().toLowerCase();
        if (!email) { msg('Digite seu e-mail'); return; }
        msg('Enviando…', true);
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) { msg(/not (allowed|found)|Signups/i.test(error.message) ? 'Esse e-mail não tem permissão 💔' : error.message); return; }
        $('[data-step="email"]').style.display = 'none';
        $('[data-step="code"]').style.display = 'block';
        $('[data-step-hint]').textContent = `Código enviado para ${email}`;
        msg('', true); $('[data-code]').focus();
      });
      $('[data-back]').addEventListener('click', () => {
        $('[data-step="code"]').style.display = 'none';
        $('[data-step="email"]').style.display = 'block';
        $('[data-step-hint]').textContent = 'Esse site é só nosso. Confirme que é você.';
        msg('', true);
      });
      $('[data-verify]').addEventListener('click', async () => {
        const token = $('[data-code]').value.trim();
        if (token.length < 6) { msg('Digite o código de 6 dígitos'); return; }
        msg('Verificando…', true);
        const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
        if (error) { msg('Código inválido ou expirado'); return; }
        wrap.remove(); resolve(true);
      });
      $('[data-code]').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-verify]').click(); });
      $('[data-email]').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-send]').click(); });
    });
  }

  // ── Assina todos os arquivos de um bucket e preenche o cache ──────────────
  async function refreshBucket(bucket) {
    const { data, error } = await sb.storage.from(bucket).list('', { limit: 1000 });
    if (error || !data) return;
    const names = data.map((o) => o.name).filter((n) => n !== '.emptyFolderPlaceholder');
    if (!names.length) { urls[bucket] = new Map(); return; }
    const { data: signed } = await sb.storage.from(bucket).createSignedUrls(names, SIGN_TTL);
    const map = new Map();
    (signed || []).forEach((s) => { if (s.signedUrl) map.set(s.path, s.signedUrl); });
    urls[bucket] = map;
  }

  // ── Portão: garante sessão + carrega URLs assinadas; chama onReady ────────
  async function gate(onReady) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) await loginScreen();
    await Promise.all([refreshBucket('photos'), refreshBucket('audio')]);
    onReady();
  }

  // ── Listagem por prefixo (a partir do cache assinado) ─────────────────────
  async function list(prefix) {
    const files = [...urls.photos.keys()]
      .filter((f) => f.startsWith(prefix + '-'))
      .sort((a, b) => {
        const na = parseInt((a.match(/(\d+)(?:\.[^.]+)?$/) || [0, 0])[1]);
        const nb = parseInt((b.match(/(\d+)(?:\.[^.]+)?$/) || [0, 0])[1]);
        return na - nb;
      });
    return { files };
  }

  async function exists(bucket, file) {
    return urls[bucket].has(file);
  }

  // ── Upload — replica a lógica de extensão/destino do server.js ────────────
  const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const VID_EXTS = ['.mp4', '.webm', '.mov'];
  const AUD_EXTS = ['.mp3', '.m4a', '.ogg'];
  const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  };

  // HEIC/DNG: tenta converter para JPEG no navegador (funciona no Safari).
  async function tryConvertToJpeg(file) {
    try {
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width; canvas.height = bmp.height;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.88));
      return blob || null;
    } catch { return null; }
  }

  async function upload(slot, file) {
    let ext = ('.' + (file.name || '').split('.').pop()).toLowerCase();
    const ct = (file.type || '').toLowerCase();
    const needsConversion = ['.dng', '.heic', '.heif'].includes(ext);
    const isAudio = ct.startsWith('audio/') || AUD_EXTS.includes(ext);
    const isVideo = !needsConversion && (ct.startsWith('video/') || VID_EXTS.includes(ext));

    let bucket, body = file;
    if (isAudio) {
      if (!AUD_EXTS.includes(ext)) ext = '.mp3';
      bucket = 'audio';
    } else if (isVideo) {
      if (!VID_EXTS.includes(ext)) ext = '.mp4';
      bucket = 'photos';
    } else {
      bucket = 'photos';
      if (needsConversion) {
        const jpeg = await tryConvertToJpeg(file);
        if (jpeg) { body = jpeg; ext = '.jpg'; }
        // Sem conversão possível: sobe o arquivo original mesmo (Safari exibe HEIC)
      } else if (!IMG_EXTS.includes(ext)) {
        ext = '.jpg';
      }
    }

    const name = slot + ext;
    const { error } = await sb.storage.from(bucket).upload(name, body, {
      upsert: true,
      contentType: MIME[ext] || body.type || 'application/octet-stream',
      cacheControl: '3600',
    });
    if (error) return { success: false, error: error.message };
    const { data: signed } = await sb.storage.from(bucket).createSignedUrl(name, SIGN_TTL);
    if (signed?.signedUrl) urls[bucket].set(name, signed.signedUrl);
    return { success: true, path: urls[bucket].get(name) || '' };
  }

  async function remove(file) {
    const { error } = await sb.storage.from('photos').remove([file]);
    if (!error) urls.photos.delete(file);
    return { success: !error };
  }

  // ── Textos ────────────────────────────────────────────────────────────────
  async function getTexts() {
    const { data, error } = await sb.from('texts').select('key,value');
    if (error || !data) return {};
    const out = {};
    data.forEach((r) => { out[r.key] = r.value; });
    return out;
  }

  async function saveText(key, value) {
    const { error } = await sb.from('texts').upsert({ key, value, updated_at: new Date().toISOString() });
    return { success: !error };
  }

  return { gate, list, exists, upload, remove, getTexts, saveText, photoUrl, audioUrl };
})();
