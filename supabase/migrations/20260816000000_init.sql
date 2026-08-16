-- Site Miguel & Larissa — schema inicial
-- Edição restrita aos e-mails do casal (RLS), leitura pública.
create table if not exists public.texts (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.texts enable row level security;

drop policy if exists "texts_read" on public.texts;
create policy "texts_read" on public.texts for select using (true);
drop policy if exists "texts_insert" on public.texts;
create policy "texts_insert" on public.texts for insert to authenticated with check ((auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));
drop policy if exists "texts_update" on public.texts;
create policy "texts_update" on public.texts for update to authenticated using ((auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('photos','photos', true, 52428800), ('audio','audio', true, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "media_read" on storage.objects;
create policy "media_read" on storage.objects for select using (bucket_id in ('photos','audio'));
drop policy if exists "media_insert" on storage.objects;
create policy "media_insert" on storage.objects for insert to authenticated with check (bucket_id in ('photos','audio') and (auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));
drop policy if exists "media_update" on storage.objects;
create policy "media_update" on storage.objects for update to authenticated using (bucket_id in ('photos','audio') and (auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));
drop policy if exists "media_delete" on storage.objects;
create policy "media_delete" on storage.objects for delete to authenticated using (bucket_id in ('photos','audio') and (auth.jwt()->>'email') in ('larissa44000@gmail.com','migueloliveiravilela1@gmail.com'));

-- Seed: textos editados no site antigo (texts.json)
insert into public.texts (key, value) values
  ('comeco-p-1','Era a virada de 2023 para 2024 e por algum motivo algo decidiu que nós dois iriamos nos encontrar.'),
  ('trip-ubatuba-city','Ubatuba e Campos do Jordão'),
  ('trip-ubatuba-desc','Primeira viagem pra praia com meu amor e ainda contou com uma passadinha em campos, te amoo'),
  ('trip-ouropreto-desc','Viagem pra comemorar um ano do pedido, que delicia conhecer ouro preto com voce meu amor'),
  ('trip-bahia-desc','A famosa Bahia, depois que foi la comigo, acredito que seja um dos melhores lugares do mundo, te amooo'),
  ('trip-monteverde-desc','Viagenzinha romantica e com a familia toda, foi maravilhoso conhecer e viver esse friozinho com voce do meu lado amor'),
  ('comeco-p-2','No começo da festa eu te vi, aquele vestidão amarelo, e na segunda ou terceira vez que te olhei eu tive a certeza de que eu não poderia perder a chance de beijar a mulher mais linda do planeta.'),
  ('comeco-p-3','A festa foi passando até que rolou ( com ajuda do Rafael e da Luiza) e ali vi que fodeu, que coisa bizarra, eu literalmente apaixonei e senti no primeiro beijo que eu tava beijando o amor da minha vida, dali pra frente nossas vidas mudaram e passaram a ser praticamente uma só.'),
  ('tl-encontro-desc','O dia que conheci meu amor'),
  ('tl-namoro-desc','Dia que preparei toda surpresinha pra você, nossas fotinhas, as musicas, e te pedi em namoro oficialmente!'),
  ('tl-lotus-desc','O lótinhoooos chegando e toda felicidade que ele trouxe pra nós'),
  ('tl-ubatuba-desc','A nossa primeira viagem, que delicia ir pra ubatuba com você, e ainda teve uma passadinha em campos do jordão'),
  ('tl-reveillon-desc','Nossa segunda virada, a qual marcava um ano que tinha te conhecido, fomos pra praia e aproveitamos demaaais, a viagem foi tão boa que praticamente nao tenho foto'),
  ('tl-ouropreto-desc','Que viagensinha mais gostosa, viagem na qual comemoramos 1 ano de namoro, conhecendo um lugar totalmente romantico, que climiha delicioso foi estar la com voce, ansioso pras proximas deste tipo!'),
  ('tl-cavalo-desc','Primeira vez conseguindo efetivamente andar de cavalo, marco muito grande, porque ver o amor da minha vida se aproximando de algo que tanto amo é gostoso demais, te amo!'),
  ('tl-monteverde-desc','Mais uma dessas viagenzinhas românticas porém essa com a familia, o que não muda nada, pois foi uma delicia conhecer um lugar tao gostoso e dormir todo agarradinho por causa do frio'),
  ('tl-bahia-desc','aa Bahia, a famosa bahia, lugar que você tinha tanta vontade de conhecer e acredito que tenha correspondido as suas expectativas, tudo foi maravilhoso!'),
  ('tl-2anos-desc','Enfim, dois anos de nós dois, e com a certeza que isso é só um pedaço das diversas décadas que ainda virão, te amo demais!'),
  ('tl-carnaval-desc','Algumas fotinhas dessa que é uma das datas que a gente mais gosta e aproveita, e também muito marcante, pois foi no nosso primeiro carnaval que percebemos que realmente era pra sempre'),
  ('tl-cruzeiro-desc','Mais um das paixões que venho trazendo para você, que delicia que é trazer você um pouco para o meu mundinho'),
  ('tl-japinha-desc','Sem duvida um de nossos programas favoritos é esse, comidinha um vinhozinho ou cervejinha'),
  ('tl-conquistas-desc','A superintendência dele, o emprego novo dela — cada vitória nossa é de nós dois.'),
  ('reason-1','pela sua maneira de ser, e de incendiar onde está com o seu amor'),
  ('reason-2','Pela forma com que me ama e me trata'),
  ('reason-3','Porque cada dia que fico do seu lado tenho mais certeza que você é a pessoa que eu sempre sonhei encontrar'),
  ('reason-4','pois eu tenho a certeza que você é a melhor pessoa do mundo pra ser mãe dos meus filhos'),
  ('reason-5','Por você ser o melhor lugar do mundo'),
  ('reason-6','Enfim, por tudo que você é e por tudo que somos juntos'),
  ('letter-p-1','Amor, sabe que não sou a melhor pessoa do mundo com palavras, mas venho por meio desta carta , falar um pouco de você e de nós dois, vou começar que acho muito interessante você e o que trouxe para minha vida, porque desde que chegou eu não tive mais duvidas ou incertezas, desde que te beijei tive a certeza que seria diferente de tudo que já havia vivido'),
  ('letter-p-2','Você com esse jeito meigo e princesa de ser, mudou minha maneira de enxergar o amor, e me fez acreditar naqueles contos de fadas em que existem principes, princesas e relacionamentos perfeitos, justo no momento que eu tinha certeza que isso era apenas história'),
  ('letter-p-3','E igual a um furacão mudou minha vida toda, e em 4 dias eu já tava sofrendo por que você iria para São Paulo e rezando para que voltasse o mais rápido possivel'),
  ('letter-p-4','Tudo que penso quando olho pra você é perfeição, desde esse seu rosto maravilhoso, até esse seu corpo desenhado no qual sou extremamente apaixonado, até ao seu jeito, meigo, simpático e princesa de ser'),
  ('letter-p-5','Amo tudo em você, o jeito que me olha, que me beija, que me escuta, que conversa, que discute, o bico, o sorriso, a cara de choro, a de fome, a de raiva, a de desespero, a dancinha quando a comida é gostosa, enfim eu sou perdidamente apaixonado no jeito larissa de ser'),
  ('letter-p-6','Obrigado por tudo e por ser exatamente você, pois não ter como ser melhor'),
  ('letter-p-7','Eu te amo mais do que você imagina e muitas vezes mais do que transpareço, você é a pessoa da minha vida!')
on conflict (key) do update set value = excluded.value, updated_at = now();
