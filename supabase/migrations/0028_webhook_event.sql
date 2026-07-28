-- Modül 07 — Dış sağlayıcı olayları (07.5). STACK §13 "Webhook güvenliği".
--
-- Ödeme sağlayıcısı aynı olayı BİRDEN ÇOK KEZ gönderir — bu bir arıza değil, sözleşmenin kendisidir
-- ("at least once"). Ağ koptuğunda, 200 geç döndüğünde ya da sağlayıcı yeniden denediğinde aynı
-- `checkout.session.completed` tekrar gelir. Kayıt tutulmazsa aynı tahsilat iki kez yazılır ve
-- sipariş iki kez onaylanır.
--
-- Çare tek satır: **(sağlayıcı, olay no) BENZERSİZ**. İkinci geliş yazıma takılır, işleyici no-op eder.
-- Bayrak (`processed_at`) idempotensin kaynağı DEĞİL, izidir: "geldi ama işlenemedi" ile "işlendi"
-- ayrımı alarmın ve elle tekrar denemenin girdisidir.
--
-- Gövde (`payload`) saklanır: sağlayıcı panelinden bakmadan "o gün ne geldi" cevaplanabilsin.
-- Kişisel veri barındırabildiği için erişim yalnız sunucudan (RLS deny-by-default).

create table public.webhook_event (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                            -- 'stripe' (ileride başka sağlayıcı)
  event_id text not null,                            -- sağlayıcının olay kimliği (evt_...)
  type text not null,                                -- 'checkout.session.completed' …
  payload jsonb,
  -- İşlendi damgası; null = geldi, henüz işlenmedi (ya da işlenirken düştü).
  processed_at timestamptz,
  -- Son hata mesajı — tekrar denemede neyin takıldığı görünür.
  error text,
  created_at timestamptz not null default now()
);

-- İdempotensin TEK dayanağı. Kısmi indeks DEĞİL: `on conflict` hedefleyebilmeli (12.4'te öğrenildi).
create unique index webhook_event_provider_key on public.webhook_event (provider, event_id);
-- "Bugün ne geldi / neler işlenmedi" okuması.
create index webhook_event_created_idx on public.webhook_event (created_at desc);

alter table public.webhook_event enable row level security;
