-- Modül 07 — Teslimat bölgesi (07.2). DOMAIN §6, ADR-002 (sınır ötesi posta kodları).
--
-- **Rota-içi/dışı SAKLANMAZ, türetilir:** adresin posta kodu aktif bir bölgeye düşüyorsa rota içi,
-- düşmüyorsa kargo. Adres tablosunda `in_route` diye bir kolon bilerek yok.
--
-- Bölgeler admin-editable: posta kodu kümesi ve haftalık günler kod sabiti değildir. Alman (Baden)
-- posta kodları da bir bölgeye dahil edilebilir — sınır, rotanın değil devletin çizgisidir.

create table public.delivery_zone (
  id uuid primary key default gen_random_uuid(),
  name text not null,                                -- iç etiket ("Strasbourg Kuzey")
  -- **BÖLGE TEK DEPOYA BAĞLIDIR** (DOMAIN §17): posta kodu → bölge → depo zincirinin orta halkası.
  -- Zincir bu yüzden tek yönlü ve tekil çözülür; "hangi depo bakar" sorusunun ikinci cevabı yoktur.
  -- FK YOK: `warehouse` 0042'de açılır.
  warehouse_id uuid not null,
  -- Haftalık teslimat günleri, ISO: 1=Pazartesi … 7=Pazar.
  weekdays int[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Posta kodu ↔ bölge (DOMAIN §17, tekillik VERİDE) ─────────────────────────
-- Kod kümesi `delivery_zone.postal_codes` dizisiydi; iki bölgeye aynı kodu yazmak SERBESTTİ ve
-- çözücü "ilki kazanır" diyerek sessizce birini seçiyordu. Tek depoda bu yalnız yanlış rota günü
-- demekti; çok depoda **siparişin yanlış depoya düşmesi** demek — mal başka şehirde, sipariş burada.
-- Bu yüzden küme diziden çıkıp kendi tablosuna taşındı: çakışma artık kayıt anında reddedilir.
--
-- PK `(country, postal_code)`: posta kodu ülkeler arası benzersiz DEĞİLDİR — `67000` hem Fransa'da
-- hem Almanya'da geçerlidir. Yer çözümü daima (ülke, kod) ikilisidir.
--
-- Ülke BÖLGEDE değil burada durur, bilerek: bir bölge sınır ötesi olabilir (ADR-002 — Strasbourg
-- rotası Kehl'i de kapsayabilir, "sınır rotanın değil devletin çizgisidir"). Bölgeye tek bir ülke
-- yazmak o bölgeyi bir devlete hapsederdi. Deponun ülkesi ayrı mesele: o fiziksel bir tesistir ve
-- `warehouse.country_code`'da durur.
--
-- Aktif/pasif ayrımı YOK, kapsam tüm bölgeler: pasif bölge de kodu tutar. Aynı kodu başka bölgeye
-- vermek için önce eskisinden silinir — "pasifken çakışmasın" esnekliği, bölge yeniden açıldığında
-- iki sahipli bir kod bırakırdı ve o an kimse bakmıyor olurdu.
create table public.delivery_zone_postal_code (
  country country_code not null,
  -- Normalize saklanır (boşluksuz, büyük harf) — arama tarafı da normalize eder; iki taraf aynı
  -- kuralı uygulamazsa "67 000" ile "67000" iki ayrı kod olur ve tekillik kâğıt üstünde kalır.
  postal_code text not null check (postal_code = upper(replace(postal_code, ' ', ''))),
  zone_id uuid not null references public.delivery_zone (id) on delete cascade,
  primary key (country, postal_code)
);

-- "Bu bölgenin kodları" — bölge ekranı ve rota listesi.
create index delivery_zone_postal_zone_idx on public.delivery_zone_postal_code (zone_id);

alter table public.delivery_zone enable row level security;
alter table public.delivery_zone_postal_code enable row level security;

-- Sipariş bölgeye bağlanır (0015'te FK'siz açılmıştı — tablo geldi, bağ kuruldu).
-- `restrict` DEĞİL `set null`: bölge kapatılsa bile geçmiş sipariş silinmemeli; siparişteki alan
-- zaten snapshot niteliğindedir (bölge sınırı sonradan değişebilir).
alter table public.order add constraint order_delivery_zone_fk
  foreign key (delivery_zone_id) references public.delivery_zone (id) on delete set null;
