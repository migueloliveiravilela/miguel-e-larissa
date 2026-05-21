# Miguel & Larissa ♡

Site comemorativo de namoro — SPA em HTML/CSS/JS puro com servidor Node.js.

## Rodar localmente

```bash
node server.js
# Abre http://localhost:3000
```

---

## Deploy no Railway

### 1. Criar o projeto

1. Acesse [railway.app](https://railway.app) e faça login
2. **New Project → Deploy from GitHub repo**
3. Conecte seu GitHub e selecione o repositório `miguel-e-larissa`
4. Railway detecta o `package.json` automaticamente e usa `npm start`

### 2. Variáveis de ambiente

Nenhuma variável obrigatória — o servidor usa `process.env.PORT` (definido
automaticamente pelo Railway).

Se quiser forçar um domínio personalizado, configure depois em
**Settings → Networking → Custom Domain**.

### 3. Volume persistente (ESSENCIAL — sem isso as fotos somem a cada deploy)

As fotos, vídeos e áudios ficam em `/photos/` e `/audio/` no container.
Sem um volume, essas pastas são recriadas vazias a cada redeploy.

**Como configurar:**

1. No painel do Railway, abra seu serviço
2. Vá em **Volumes** → **Add a Volume**
3. Configure:
   - **Mount Path**: `/app/photos` ← onde o Railway monta o volume no container
   - **Size**: 5 GB (plano Hobby suporta até 10 GB)
4. Repita para o áudio:
   - **Mount Path**: `/app/audio`
   - **Size**: 1 GB
5. Clique **Deploy** — Railway faz redeploy com o volume montado

> **Por que dois volumes?** Railway associa um volume a um único mount path.
> Fotos e áudio ficam em pastas diferentes, então precisam de volumes separados.

> **Atenção ao path**: o Railway define `RAILWAY_APP_DIR=/app` por padrão.
> O `server.js` usa `__dirname` como raiz, que aponta para `/app` no container.
> Por isso os volumes devem ser montados em `/app/photos` e `/app/audio`.

### 4. Arquivo texts.json (textos editados inline)

O `texts.json` guarda os textos editados pelo site. Ele também precisa de
persistência. Opções:

**Opção A — Volume (recomendado):**
- Adicione um terceiro volume em `/app` (raiz do projeto)
- Como `/app` já é a raiz, ele persiste `texts.json` e qualquer outro arquivo

**Opção B — Volume único cobrindo tudo:**
- Mount Path: `/app` — persiste `/app/photos`, `/app/audio` e `/app/texts.json`
- Mas atenção: o Railway pode ter conflito ao montar a raiz do app

A solução mais limpa é o **Volume A** separado para cada pasta.

### 5. Domínio personalizado (ex: miguellarissa.com.br)

1. No Railway: **Settings → Networking → Custom Domain → Add**
2. Digite `miguellarissa.com.br`
3. Railway mostrará um CNAME record, ex: `xxxxxx.up.railway.app`
4. No seu registrador (ex: registro.br):
   - Adicione um registro **CNAME** apontando `www` → `xxxxxx.up.railway.app`
   - Para o domínio raiz (`@`), use um registro **ALIAS** ou **A** se o
     registrador suportar (registro.br suporta ALIAS)
5. Aguarde até 24h para propagação do DNS
6. Railway emite certificado SSL automaticamente

---

## Estrutura do projeto

```
miguel-e-larissa/
├── index.html       — SPA principal
├── style.css        — Estilos
├── script.js        — Lógica do frontend
├── server.js        — Servidor Node.js (sem dependências externas)
├── package.json
├── photos/          — Fotos/vídeos (volume persistente no Railway)
├── audio/           — Músicas (volume persistente no Railway)
└── texts.json       — Textos editados inline (volume persistente)
```

## Formatos suportados para upload

| Tipo   | Formatos                          |
|--------|-----------------------------------|
| Foto   | JPG, PNG, WEBP, GIF, HEIC, DNG   |
| Vídeo  | MP4, WEBM, MOV                    |
| Áudio  | MP3, M4A, OGG, WAV               |

HEIC e DNG são convertidos automaticamente para JPEG no servidor via `sips`
(ferramenta nativa do macOS). **No Railway (Linux), `sips` não existe.**

### Converter HEIC/DNG no Railway (Linux)

Instale `libvips` ou `imagemagick` via Nixpacks. Adicione um arquivo
`nixpacks.toml` na raiz:

```toml
[phases.setup]
nixPkgs = ["vips", "imagemagick"]
```

E atualize `server.js` para usar `convert` (ImageMagick) em vez de `sips`:

```js
// Substitui sips por convert (ImageMagick) — funciona em Linux e macOS
execFile('convert', [tmpPath, dest], { timeout: 30000 }, callback);
```
