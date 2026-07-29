-- Modül 17 — Alım-sonrası geri bildirim daveti (17.2). DOMAIN §14, `design/pages/musteri-geri-bildirim.md`.
--
-- Teslimden ~10 gün sonra giden kişisel davet: "geçen haftaki siparişin nasıldı?" Müşteri aldığı
-- ürünleri kart kart değerlendirir; akış bir dakikadan kısa bitmeli.
--
-- ── TOKEN OTURUM YERİNE GEÇER ───────────────────────────────────────────────
-- Davet e-postadan/WhatsApp'tan gelir ve telefonda tek elle açılır; araya giriş ekranı koymak akışı
-- kırar ve tamamlanma oranını düşürür. Bağlantının kendisi kimlik taşır.
--
-- Bu yüzden `reference_no` ile aynı kural: **rastgele, sıralı değil.** Sıralı üretilseydi bir davet
-- bağlantısından komşusunun siparişine geçilebilirdi.
--
-- ── İLERLEME SAKLANMAZ ──────────────────────────────────────────────────────
-- "2/5 tamamlandı" siparişin ürünleri ile o davetten doğan `product_feedback` kayıtlarından
-- TÜRETİLİR (`feedback_request_progress`). Bir sayaç tutulsaydı, yarıda bırakılıp geri dönülen
-- akışta bir gün gerçekle ayrışırdı — ve müşteri "ben bunu değerlendirmiştim" derdi.
--
-- `completed_at` yine de SAKLANIR ve bu çelişki değil: türetilebilen şey ilerlemedir, akışın
-- SONLANDIĞI an değil. Müşteri her ürünü değerlendirmeden de "bitir" diyebilir; puanın tek kez
-- verilmesini de o damga sağlar.

-- Davetin hangi kanaldan gittiği. Müşterinin tercih ettiği kanal değil, DAVETİN kanalı: aynı
-- müşteriye bir kez e-posta bir kez WhatsApp gidebilir ve hangisinin tamamlandığını bilmek,
-- kanalların dönüşümünü karşılaştırmanın tek yolu.
create type feedback_channel as enum ('email', 'whatsapp');

create table public.feedback_request (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null references public.order (id) on delete cascade,
  customer_id uuid not null references public.user_profiles (id) on delete cascade,

  -- Davet bağlantısının anahtarı; oturum yerine geçer. Rastgele üretilir (uygulama katmanı).
  token text not null unique,

  channel feedback_channel not null,
  sent_at timestamptz,
  completed_at timestamptz,
  -- Tamamlamada verilen puan. Defterdeki satırın kopyası DEĞİL, davetin kendi kaydı: "bu davet ne
  -- kazandırdı" sorusu, defteri taramadan cevaplanabilmeli.
  points_awarded int check (points_awarded >= 0),
  constraint feedback_request_points_need_completion check (points_awarded is null or completed_at is not null),

  created_at timestamptz not null default now()
);

alter table public.feedback_request enable row level security;

-- **Sipariş başına tek davet.** İkinci bir davet aynı ürünleri ikinci kez sorardı; müşteri için
-- bıkkınlık, veri için gürültü.
create unique index feedback_request_order_key on public.feedback_request (order_id);
create index feedback_request_customer_idx on public.feedback_request (customer_id, created_at desc);
-- Gönderilmeyi bekleyen davetler (tarama işi buradan okur).
create index feedback_request_unsent_idx on public.feedback_request (created_at) where sent_at is null;

-- ── İlerleme ────────────────────────────────────────────────────────────────
-- Siparişteki AYRI ÜRÜN sayısı ile o davetten doğan değerlendirme sayısı. Varyant değil ürün
-- sayılır: değerlendirme ürün düzeyindedir (aynı ürünün iki boyu tek karttır).
create or replace view public.feedback_request_progress as
select r.id as feedback_request_id,
       r.order_id,
       r.customer_id,
       r.completed_at,
       coalesce(o.product_count, 0) as total_products,
       coalesce(f.rated_count, 0)   as rated_products
  from public.feedback_request r
  left join lateral (
    select count(distinct v.product_id) as product_count
      from public.order_item oi
      join public.product_variant v on v.id = oi.variant_id
     where oi.order_id = r.order_id
  ) o on true
  left join lateral (
    select count(*) as rated_count
      from public.product_feedback pf
     where pf.feedback_request_id = r.id
  ) f on true;

comment on view public.feedback_request_progress is
  'Davetin ilerlemesi — "2/5" siparişten ve değerlendirmelerden TÜRETİLİR, saklanmaz (17.2).';

-- ── Ayarlar ─────────────────────────────────────────────────────────────────
-- Bekleme süresi ve Google bağlantısı **parametrik**: ikisi de iş kararıdır ve dağıtım beklemeden
-- değişebilmelidir (STACK §10).
--
-- `google_review_url` BOŞ başlar ve bu doğru: işletmenin Google kaydı yokken uydurma bir adrese
-- yönlendirmektense davet hiç gösterilmez (`feedbackOutcomeOf` bunu bilir).
insert into public.settings (key, value, description) values
  ('feedback_delay_days', '10', 'Teslimden kaç gün sonra geri bildirim daveti gider. Erken sormak "daha açmadım", geç sormak unutulmuş bir deneyim getirir.'),
  ('google_review_url',   '""', 'İşletmenin Google değerlendirme bağlantısı. BOŞSA akış sonunda Google daveti gösterilmez.')
on conflict (key) where scope_id is null do nothing;
