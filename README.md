# Miguel & Larissa ♡

Site comemorativo de namoro — SPA em HTML/CSS/JS puro, **sem servidor próprio**.

## Arquitetura (desde 2026-08-16)

O Railway foi desativado (créditos acabaram). A hospedagem atual é:

| Peça | Onde | Custo |
|------|------|-------|
| Página (HTML/CSS/JS) | GitHub Pages, branch `gh-pages` deste repo | grátis |
| Fotos e vídeos | Supabase Storage, bucket `photos` (público) | grátis (< 1 GB) |
| Músicas | Supabase Storage, bucket `audio` (público) | grátis |
| Textos editados inline | Supabase, tabela `public.texts` | grátis |
| Login de edição | Supabase Auth — 1 usuário compartilhado (`edicao@miguelelarissa.site`) | grátis |

- URL do site: `https://migueloliveiravilela.github.io/miguel-e-larissa/`
- Projeto Supabase: conta pessoal do Miguel (ver `config.js` para a URL do projeto)
- Qualquer visitante **vê** tudo; para **editar** (upload, deletar, trocar texto) o site
  pede a senha de edição na primeira ação — a sessão fica salva no navegador.

## Arquivos

```
index.html        — SPA principal
style.css         — Estilos
script.js         — Lógica do frontend (fala com window.API)
config.js         — URL + anon key do Supabase (público por design)
supabase-api.js   — Adaptador: list/upload/remove/texts via supabase-js
supabase/         — Migration SQL (tabela texts + buckets + policies + seed)
server.js         — LEGADO (era o servidor do Railway; não é mais usado)
photos/, audio/   — Cópia local do acervo (backup); a fonte viva é o Storage
texts.json        — LEGADO (seed inicial da tabela texts)
```

## Deploy

1. **Página**: commit na branch `gh-pages` → GitHub Pages publica sozinho (~1 min).
2. **Schema**: `supabase db push` com o projeto linkado (ou colar a migration no SQL Editor).
3. **Mídia**: os vídeos foram recomprimidos (H.264 ≤ 1080p, CRF 26) para caber no
   plano grátis: máx. 50 MB por arquivo e 1 GB total. Originais `.mov` ficam
   guardados só na pasta local `photos/`.

## Notas

- O plano grátis do Supabase tem 5 GB de banda/mês — suficiente para uso do casal.
- HEIC/DNG: o upload converte para JPEG no navegador quando possível (Safari);
  no Chrome o arquivo sobe no formato original.
- O domínio `miguellarissa.com.br` citado na versão antiga **nunca foi registrado**.
