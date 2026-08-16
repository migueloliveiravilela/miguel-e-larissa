-- Site Miguel & Larissa — schema (SITE PRIVADO)
-- Leitura E escrita restritas aos 2 e-mails do casal. Sem seeds aqui:
-- os textos moram só no banco (conteúdo pessoal fora do repositório).
create table if not exists public.texts (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.texts enable row level security;

drop policy if exists "texts_read" on public.texts;
create policy "texts_read" on public.texts for select to authenticated using ((auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));
drop policy if exists "texts_insert" on public.texts;
create policy "texts_insert" on public.texts for insert to authenticated with check ((auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));
drop policy if exists "texts_update" on public.texts;
create policy "texts_update" on public.texts for update to authenticated using ((auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('photos','photos', false, 52428800), ('audio','audio', false, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "media_read" on storage.objects;
create policy "media_read" on storage.objects for select to authenticated using (bucket_id in ('photos','audio') and (auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));
drop policy if exists "media_insert" on storage.objects;
create policy "media_insert" on storage.objects for insert to authenticated with check (bucket_id in ('photos','audio') and (auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));
drop policy if exists "media_update" on storage.objects;
create policy "media_update" on storage.objects for update to authenticated using (bucket_id in ('photos','audio') and (auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));
drop policy if exists "media_delete" on storage.objects;
create policy "media_delete" on storage.objects for delete to authenticated using (bucket_id in ('photos','audio') and (auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));
