# Miguel & Larissa ♡

Site comemorativo de namoro — SPA em HTML/CSS/JS puro, **sem servidor próprio** e **privado**: só Miguel e Larissa conseguem ver o conteúdo.

## Arquitetura (desde 2026-08-16, privado desde o mesmo dia)

O Railway foi desativado (créditos acabaram). A hospedagem atual é:

| Peça | Onde | Custo |
|------|------|-------|
| Página (HTML/CSS/JS) | GitHub Pages, branch `gh-pages` deste repo | grátis |
| Fotos e vídeos | Supabase Storage, bucket `photos` (**privado**) | grátis (< 1 GB) |
| Músicas | Supabase Storage, bucket `audio` (**privado**) | grátis |
| Textos (inclusive a carta) | Supabase, tabela `public.texts` (leitura restrita) | grátis |
| Login | Supabase Auth — OTP por e-mail, signup desligado | grátis |

- URL do site: `https://migueloliveiravilela.github.io/miguel-e-larissa/`
- Projeto Supabase: conta pessoal do Miguel, ref `mddhuzuetaubrcitgjxn` (sa-east-1)

## Modelo de privacidade

1. **Portão de login**: a página abre num overlay de login; `script.js` (que carrega
   textos e mídia) só é injetado depois da sessão validada.
2. **Só 2 contas existem**: `migueloliveiravilela1@gmail.com` e `larissa44000@gmail.com`
   (pré-criadas via admin; signup desligado — OTP para outro e-mail é recusado).
3. **RLS em tudo**: leitura e escrita da tabela `texts` e dos buckets exigem
   `auth.jwt()->>'email'` na allowlist. O frontend é conveniência; o banco é a tranca.
4. **Mídia por URL assinada**: buckets privados; após o login o site assina os
   ~180 arquivos em lote (validade 7 dias) e monta as galerias com esses links.
5. **HTML público neutro**: todos os textos pessoais (`data-text-key`) foram
   esvaziados do HTML e movidos para a tabela; o repositório teve o histórico
   **zerado** em 2026-08-16 para expurgar fotos/textos que já foram públicos.

## Arquivos

```
index.html        — SPA (textos pessoais vazios; preenchidos após login)
style.css         — Estilos
script.js         — Lógica do frontend (fala com window.API)
config.js         — URL + anon key do Supabase (público por design)
supabase-api.js   — Gate de login + adaptador (signed URLs, texts, upload)
supabase/         — Migration SQL sanitizada (schema + policies, SEM seeds)
server.js         — LEGADO local (era o Railway; fora do repo)
photos/, audio/   — Acervo original local (backup; fora do repo)
texts.json        — LEGADO local (seed inicial; fora do repo)
.db-password.txt  — Senha do Postgres do projeto (só local)
```

## Deploy

1. **Página**: commit na branch `gh-pages` → GitHub Pages publica sozinho (~1 min).
2. **Schema**: migration sanitizada via SQL Editor ou management API (os textos
   pessoais NUNCA vão para o repo — seeds só direto no banco).
3. **Mídia**: vídeos recomprimidos (H.264 ≤1080p CRF 26; 1 GB → 296 MB).
   Originais `.mov` só na pasta local `photos/`.

## Notas

- Supabase CLI: usar `SUPABASE_ACCESS_TOKEN` por comando (token do CLI armazenado
  é o do Go2Med — não sobrescrever).
- "Entrar com Google": preparado (`GOOGLE_LOGIN` no config.js) mas desligado —
  exige credenciais OAuth criadas manualmente no Google Cloud do Miguel.
- O domínio `miguellarissa.com.br` nunca foi registrado.
