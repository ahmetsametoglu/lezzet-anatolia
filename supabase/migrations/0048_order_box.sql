-- Modül 23 — Sipariş kutusu: bizim bastığımız QR'ın kaydı (karar §1.4, `docs/feature/barkod-okuyucu.md`).
--
-- ── İKİ KİMLİKTEN İKİNCİSİ ──────────────────────────────────────────────────
-- 0047 DIŞ dünyanın kimliğini aldı (ürün barkodu — "bu hangi mal"); bu tablo BİZİM ürettiğimiz
-- kimliği taşır: kutunun üstüne basılan QR — "bu hangi kayıt". Biri öğrenilir ve geri alınabilir,
-- öteki üretilir ve kalıcıdır; ikisinin ayrı tablolarda yaşaması 0047'nin kendi kararıydı.
--
-- ── KUTU DÖNGÜSÜ (karar §1.4) ───────────────────────────────────────────────
-- Sipariş seç → kutu aç → okutarak doldur → "kutu kapandı" → her şey konduysa sipariş kapanır,
-- değilse yeni kutu açılır. Tek kutu döngünün özel hâlidir — ayrı bir "tek kutulu" akış yoktur.
-- `sealed_at null` = AÇIK kutu (masada dolduruluyor); kapanan kutu salt-okunurdur.
--
-- ── KUTU KODU `reference_no` DEĞİL (Netleşecek 4) ───────────────────────────
-- Sipariş referansı müşteriye gösteriliyor; teslim kaydını düşüren kod ondan TÜRETİLEMEZ olmalı,
-- yoksa referansı bilen biri teslim kaydı düşürebilir. Kod ayrı üretilir (`orderBoxCode`,
-- domain-core: `KT-YY-` + 10 karakter — sipariş referansından hem önek hem uzunlukça ayrık).
--
-- ── KUTUSUZ AKIŞ YAŞAMAYA DEVAM EDER (bilinçli çift akış) ───────────────────
-- Web hazırlık masası bugünkü gibi kutusuz onaylayabilir; kutusu olmayan sipariş eski yoldan
-- gider. Kural: bir siparişin BİR KALEMİ kutuya girdiyse o kalemin bütün hazırlığı kutulardan
-- yürür — `seal_order_box` bunu Σ kutu = karşılanan denetimiyle zorlar (aşağıda).

create table public.order_box (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  -- Kutu SİPARİŞİN deposunda doldurulur (DOMAIN §17); kolon yine de burada: yükleme okutması
  -- (23.8) "bu kutu hangi rampadan biner" sorusunu siparişe gitmeden cevaplar. `restrict`:
  -- içinde kutu kaydı olan depo silinemez (depo zaten silinmez, susturulur — 0031 çizgisi).
  warehouse_id uuid not null references public.warehouse (id) on delete restrict,
  -- Sipariş içi sıra ("Kutu 2/3") — etikete ve ekrana yazılan insan sayısı; kimlik DEĞİL
  -- (kimlik `code`). Benzersizlik sipariş içinde.
  box_no int not null,
  -- QR'ın içeriği BU koddur. Global benzersiz: yükleme/teslim okutması yalnız kodu görür,
  -- hangi siparişin kutusu olduğunu kod söylemek zorunda.
  code text not null,
  -- Kapanış anı + kapatan. `null` = açık kutu. Kapatan kişi `set null`: personel kaydı
  -- silinirse kutu kaydı YAŞAR (0047 `created_by` gerekçesinin aynısı).
  sealed_at timestamptz,
  sealed_by uuid references public.user_profiles (id) on delete set null,
  -- Etiket basım anı (23.7 yazar). Kapanıştan ayrı damga: basım fiziksel bir işlemdir ve
  -- başarısız olabilir — "kapalı ama etiketi basılamadı" görünür bir hâl olmalı.
  printed_at timestamptz,
  -- Araca yükleme (23.8 yazar): kim, ne zaman okuttu. Sayaç ("5/8 bindi") bu damgalardan
  -- TÜRER — ayrı tablo yok (karar §1.11).
  loaded_at timestamptz,
  loaded_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_box_code_uq unique (code),
  constraint order_box_no_uq unique (order_id, box_no),
  constraint order_box_no_positive check (box_no > 0),
  -- Açık kutu araca binemez: yüklemenin okuttuğu QR ancak KAPANMIŞ (içeriği kesinleşmiş)
  -- kutunun etiketindedir. Kural veride durur; ekran cümlesi uygulama katmanında.
  constraint order_box_loaded_after_sealed check (loaded_at is null or sealed_at is not null)
);

-- Siparişin kutuları tek turda: hazırlık kuyruğu, web kutu özeti ve yükleme sayacı bu yönden okur.
create index order_box_order_idx on public.order_box (order_id);

create table public.order_box_item (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.order_box (id) on delete cascade,
  order_item_id uuid not null references public.order_item (id) on delete cascade,
  qty int not null,
  -- Aynı kalem aynı kutuda TEK satırdır (adet toplanarak yazılır); bir kalem birden çok KUTUYA
  -- bölünebilir — bu yüzden benzersizlik (kutu, kalem) çiftinde.
  constraint order_box_item_uq unique (box_id, order_item_id),
  constraint order_box_item_qty_positive check (qty > 0)
);

create index order_box_item_item_idx on public.order_box_item (order_item_id);

alter table public.order_box enable row level security;
alter table public.order_box_item enable row level security;
-- Politika YOK — bilinçli (0047 ile aynı): tablolara yalnız service-role erişir; müşteri
-- yüzeyinin kutuyla işi yoktur (kutu kodu müşteriye hiç gösterilmez — Netleşecek 4 gerekçesi).

-- ── KUTU KAPANIŞI — kutu + picks TEK transaction ────────────────────────────
--
-- NEDEN RPC (STACK §13 (b)): kutu kalemleri ile hazırlık kaydı bölünemez bir yazımdır. Ayrı
-- yazılsaydı "kutu var ama picks yok" (etiket basılmış, parti izi yok) ya da tersi doğabilirdi —
-- geri çağırmanın ve gerçek COGS'un dayandığı kayıt yarım kalamaz.
--
-- ⚠ EN KRİTİK NOKTA — `record_preparation` picks yazımı kalem başına ABSOLÜTTÜR (0015: "önceki
-- parti kaydı tamamen yenisiyle değişir"). Çok kutulu siparişte bir kalem iki kutuya bölünürse
-- ikinci kutunun kapanışı o kalemin picks'ini ÖNCEKİ + YENİ birleşimiyle göndermeli. Birleşimi
-- EKRAN değil `sealBox` kapısı kurar (`order_item_batch` okuması onda); buradaki denetim o
-- birleşimin gerçekten kurulduğunu doğrular: kapanıştan sonra, kutulanmış her kalem için
-- Σ kutu adedi = `fulfilled_qty` olmalı. Eşitlik bozuksa TÜM yazım geri alınır — eksik kurulmuş
-- bir birleşim, önceki kutuların parti izini sessizce silmiş demektir.
--
-- Eşzamanlılık: iki kapanış aynı kutuda `for update` kilidine çarpar; aynı SİPARİŞİN iki ayrı
-- kutusunu iki kişinin aynı anda kapatması ise fiziksel kuralla önlenir (karar §1.7: bir masa =
-- bir sipariş = bir kişi) — yazılım tarafı yarışı denetimle yakalar, kilitle çözmeye çalışmaz.
--
-- p_items: [{"order_item_id": uuid, "qty": int}, ...]  — BU kutuya konanlar
-- p_picks: record_preparation'ın girdisi (ABSOLÜT birleşim — kapı kurar)

create or replace function public.seal_order_box(
  p_box_id uuid,
  p_items jsonb,
  p_picks jsonb,
  p_actor uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order uuid;
  v_sealed timestamptz;
  v_item jsonb;
  v_item_id uuid;
  v_bad record;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'seal_order_box: boş kutu kapatılamaz';
  end if;

  select order_id, sealed_at into v_order, v_sealed
    from public.order_box where id = p_box_id for update;
  if not found then
    raise exception 'seal_order_box: kutu bulunamadı (%)', p_box_id;
  end if;
  if v_sealed is not null then
    raise exception 'seal_order_box: kutu zaten kapalı (%)', p_box_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (v_item ->> 'order_item_id')::uuid;

    -- Kalem bu siparişin olmalı — yanlış siparişin kalemi kutuya GİREMEZ (ekran zaten
    -- reddediyor; burası son savunma, okunur hatayla).
    if not exists (select 1 from public.order_item where id = v_item_id and order_id = v_order) then
      raise exception 'seal_order_box: kalem bu siparişe ait değil (%)', v_item_id;
    end if;

    insert into public.order_box_item (box_id, order_item_id, qty)
    values (p_box_id, v_item_id, (v_item ->> 'qty')::int);
  end loop;

  -- Parti izi + fulfilled_qty aynı transaction'da (yorumu 0015'te).
  perform public.record_preparation(v_order, p_picks);

  -- Σ kutu = karşılanan denetimi (başlık yorumundaki ⚠): kutulanmış her kalemde kutu dökümü
  -- ile hazırlık kaydı aynı sayıyı söylemeli. Kutusuz akışla karışan kalem de buraya düşer —
  -- "yarısı web'den kutusuz, yarısı kutudan" bir kalem bilinçli olarak REDDEDİLİR (çift akış
  -- sipariş düzeyinde meşru, kalem düzeyinde değil).
  select oi.id, oi.fulfilled_qty, b.total into v_bad
    from public.order_item oi
    join (
      select obi.order_item_id, sum(obi.qty) as total
        from public.order_box_item obi
        join public.order_box ob on ob.id = obi.box_id
       where ob.order_id = v_order
       group by obi.order_item_id
    ) b on b.order_item_id = oi.id
   where oi.order_id = v_order and b.total <> oi.fulfilled_qty
   limit 1;
  if found then
    raise exception
      'seal_order_box: kutu dökümü (%) karşılanan adetle (%) uyuşmuyor — kalem %; birleşim eksik kurulmuş',
      v_bad.total, v_bad.fulfilled_qty, v_bad.id;
  end if;

  update public.order_box
     set sealed_at = now(), sealed_by = p_actor
   where id = p_box_id;

  return jsonb_build_object('ok', true, 'items', jsonb_array_length(p_items));
end;
$$;

revoke execute on function public.seal_order_box(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
