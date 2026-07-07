-- ============================================================
-- 1% — CATALOGO PREMI DEFINITIVO (serata dell'8 luglio)
-- Incolla TUTTO questo nel SQL Editor di Supabase e premi Run.
-- Sicuro: pulisce gli avanzi di prova, azzera le estrazioni di
-- test (si riparte da zero) e imposta le scorte definitive.
-- ============================================================

-- 1) Ripulisci le estrazioni di test: la serata parte da zero.
delete from public.prize_draws;

-- 2) Togli i premi avanzati da una versione di prova (non erano nella lista vera).
delete from public.prize_types where id in ('gadget', 'dolcetto');

-- 3) Catalogo definitivo. Il "do update" forza scorte e pesi anche
--    se i premi esistono già (sistema eventuali valori sballati).
--    scorta = pezzi disponibili · peso = quanto spesso esce (frequenza).
insert into public.prize_types (id, label, emoji, weight, stock, enabled, sort) values
  ('amazon',   'BUONO AMAZON 50€',   '🛒',  1,   1,   true, 10),
  ('prosecco', 'BOTTIGLIA PROSECCO', '🍾',  1,   1,   true, 15),
  ('bracciale','BRACCIALE',          '📿',  1,   1,   true, 18),
  ('magliette','MAGLIETTA UFFICIALE','👕',  5,   10,  true, 20),
  ('shot',     'SHOT',               '🥃',  4,   15,  true, 30),
  ('drink',    'DRINK',              '🍹',  4,   10,  true, 35),
  ('torcia',   'TORCIA PORTACHIAVI', '🔦',  6,   10,  true, 40),
  ('tictoc',   'TICTOC BOX',         '📦',  15,  40,  true, 45),
  ('bubble',   'BUBBLE WORLD',       '🫧',  12,  24,  true, 50),
  ('lollipop', 'LOLLIPOP',           '🍭',  20,  40,  true, 55),
  ('mentos',   'MENTOS',             '🍬',  20,  40,  true, 60),
  ('abbraccio','ABBRACCIO',          '🤗',  8,   8,   true, 70),
  -- "niente" a peso 0: non esce mai finché resta anche un solo premio.
  -- Serve solo come rete se entra più gente dei 200 premi disponibili.
  ('niente',   'NIENTE',             '😔',  0,   null, true, 99)
on conflict (id) do update set
  label   = excluded.label,
  emoji   = excluded.emoji,
  weight  = excluded.weight,
  stock   = excluded.stock,
  enabled = excluded.enabled,
  sort    = excluded.sort;

-- Verifica: totale pezzi in palio (deve dare 200)
-- select coalesce(sum(stock),0) as pezzi_totali from public.prize_types where stock is not null;
