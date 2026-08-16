'use strict';
/* =====================================================
   API — adaptador Supabase
   Substitui o servidor Node (upload/list/texts/delete)
   por Storage + tabela `texts` do Supabase.
   ===================================================== */
window.API = (function () {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, EDIT_EMAIL } = window.SITE_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const PUB = `${SUPABASE_URL}/storage/v1/object/public`;
  const photoUrl = (file) => `${PUB}/photos/${encodeURIComponent(file)}`;
  const audioUrl = (file) => `${PUB}/audio/${encodeURIComponent(file)}`;

  // ── Sessão de edição (senha compartilhada) ────────────────────────────────
  async function ensureAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) return true;
    const pwd = window.prompt('Senha de edição:');
    if (!pwd) return false;
    const { error } = await sb.auth.signInWithPassword({ email: EDIT_EMAIL, password: pwd });
    if (error) { alert('Senha incorreta 💔'); return false; }
    return true;
  }

  // ── Listagem por prefixo (mesma semântica do servidor antigo) ─────────────
  async function list(prefix) {
    const { data, error } = await sb.storage.from('photos').list('', { limit: 1000 });
    if (error || !data) return { files: [] };
    const files = data
      .map((o) => o.name)
      .filter((f) => f.startsWith(prefix + '-'))
      .sort((a, b) => {
        const na = parseInt((a.match(/(\d+)(?:\.[^.]+)?$/) || [0, 0])[1]);
        const nb = parseInt((b.match(/(\d+)(?:\.[^.]+)?$/) || [0, 0])[1]);
        return na - nb;
      });
    return { files };
  }

  // ── Existência de um arquivo (para os probes de slot) ─────────────────────
  async function exists(bucket, file) {
    try {
      const r = await fetch(`${PUB}/${bucket}/${encodeURIComponent(file)}`, { method: 'HEAD' });
      return r.ok;
    } catch { return false; }
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
    if (!(await ensureAuth())) return { success: false, error: 'Não autenticado' };

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
    return { success: true, path: (bucket === 'audio' ? audioUrl : photoUrl)(name) };
  }

  async function remove(file) {
    if (!(await ensureAuth())) return { success: false };
    const { error } = await sb.storage.from('photos').remove([file]);
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
    if (!(await ensureAuth())) return { success: false };
    const { error } = await sb.from('texts').upsert({ key, value, updated_at: new Date().toISOString() });
    return { success: !error };
  }

  return { list, exists, upload, remove, getTexts, saveText, photoUrl, audioUrl };
})();
