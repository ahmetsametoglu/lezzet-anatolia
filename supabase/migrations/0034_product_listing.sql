-- Modül 08 — Katalogda fiyat sıralaması (08.10). `design/BACKLOG.md §1a`.
--
-- Sıralama seçeneği K18'de çiziliydi ve seçilebiliyordu ama sonucu değiştirmiyordu. Engel bir modül
-- değildi: uygulanabilir fiyat AYRI tablodadır (kanal + geçerlilik tarihi + müşteriye özel satır) ve
-- "bu ürünün b2c fiyatı" tek bir kolon değil bir SEÇİMDİR. Sayfa çekildikten sonra sıralamak seçenek
-- değil — "artan fiyat" yalnız o 30 satır içinde artan olur ve keyset sayfalama bozulur.
--
-- ── BU GÖRÜNÜM MOTORUN BİR DALINI SQL'DE YENİDEN İFADE EDER ─────────────────────
-- `domain-core/pricing.resolvePrice`'ın ZİYARETÇİ dalı: kanal `b2c`, müşteriye özel fiyat yok,
-- near-expiry teklif daha DÜŞÜKSE kazanır (eşitlikte kazanmaz — tavan ve çıpalı rezervasyon boşuna
-- devreye girmesin). Kuralın ikinci bir evi olması bilinçli bir ödünleşmedir ve tek meşru gerekçesi
-- şudur: sıralama + keyset yalnız SQL'de yapılabilir.
--
-- Ayrışma riski YORUMLA değil TESTLE tutuluyor: `catalog-sort.test.ts` görünümün verdiği sırayı
-- motorun çözdüğü fiyatlarla karşılaştırır. Kural değişirse iki taraf birlikte değişmek zorunda.

-- ── Varyantın ziyaretçi fiyatı ───────────────────────────────────────────────
create or replace view public.variant_effective_price as
with list_price as (
  -- "Geçmiş ve en yeni kazanır" (0006): aynı varyant+kanal için birden çok satır olabilir.
  -- Müşteriye özel satırlar HARİÇ — ziyaretçi onları görmez.
  select distinct on (p.variant_id) p.variant_id, p.amount
    from public.price p
   where p.channel = 'b2c' and p.customer_id is null and p.valid_from <= now()
   order by p.variant_id, p.valid_from desc
),
best_offer as (
  -- Vitrin, teklifli partilerden TARİHİ EN YAKIN olanı gösterir (`StockService.listOfferBatches`
  -- sırası) — en ucuzunu değil. Görünüm de aynı partiyi seçmeli, yoksa kartta yazan fiyatla
  -- sıralamanın kullandığı fiyat ayrışır.
  select distinct on (s.variant_id) s.variant_id, s.offer_price
    from public.stock s
   where s.offer_price is not null and s.physical_qty > 0
   order by s.variant_id, s.expiry_date
)
select lp.variant_id,
       lp.amount                                                        as list_price,
       bo.offer_price,
       -- Teklif çakışması: DÜŞÜK olan kazanır, eşitlikte teklif kazanmaz (motorla birebir).
       case when bo.offer_price is not null and bo.offer_price < lp.amount
            then bo.offer_price else lp.amount end                      as effective_price
  from list_price lp
  left join best_offer bo on bo.variant_id = lp.variant_id;

-- ── Ürünün liste satırı ──────────────────────────────────────────────────────
-- Kartın fiyatı ürünün İLK aktif varyantından okunur (`storefront/map.ts`) — çok boylu üründe bu
-- "başlangıç fiyatı"dır. Sıra burada da aynı ölçütle sabitlenir (operatörün sırası, eşitlikte doğuş
-- anı); okuma tarafı da aynı sıraya göre seçer, ikisi ayrışamaz.
create or replace view public.product_listing as
with primary_variant as (
  select distinct on (v.product_id) v.product_id, v.id as variant_id
    from public.product_variant v
   where v.is_active
   order by v.product_id, v.sort_order, v.created_at
)
select p.*,
       vep.effective_price,
       -- SIRALAMA anahtarı. Fiyatı olmayan ürün (kanal fiyatı hiç girilmemiş → satışa kapalı)
       -- listeden DÜŞMEZ, sonda durur. `null` bırakılsaydı keyset imleci orada kopardı: imleç
       -- son satırın değerinden kurulur ve `null > null` diye bir şey yoktur.
       coalesce(vep.effective_price, 'Infinity'::numeric) as sort_price
  from public.product p
  left join primary_variant pv on pv.product_id = p.id
  left join public.variant_effective_price vep on vep.variant_id = pv.variant_id;
