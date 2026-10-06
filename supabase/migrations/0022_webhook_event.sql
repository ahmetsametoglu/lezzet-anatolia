-- Dış sağlayıcı olayları. Sağlayıcı aynı olayı birden çok kez gönderir ("at least once"); (sağlayıcı, olay anahtarı) benzersiz
-- olduğu için ikinci geliş yazıma takılır ve tahsilat iki kez yazılmaz. `processed_at` "geldi ama işlenemedi" ayrımının izidir.
-- Gövde kişisel veri barındırabildiği için erişim yalnız sunucudan (RLS deny-by-default).

create table public.webhook_event (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                            -- 'revolut', 'meta', 'sendcloud'
  event_id text not null,                            -- sağlayıcının olay kimliği ya da olay anahtarı
  type text not null,                                -- olayın türü ('payment_completed' …)
  payload jsonb,
  -- İşlendi damgası; null = geldi, henüz işlenmedi (ya da işlenirken düştü).
  processed_at timestamptz,
  -- Son hata mesajı — tekrar denemede neyin takıldığı görünür.
  error text,
  created_at timestamptz not null default now()
);

-- İdempotensin tek dayanağı; kısmi indeks değil, çünkü `on conflict` onu hedefleyebilmeli.
create unique index webhook_event_provider_key on public.webhook_event (provider, event_id);
-- "Bugün ne geldi / neler işlenmedi" okuması.
create index webhook_event_created_idx on public.webhook_event (created_at desc);

alter table public.webhook_event enable row level security;
