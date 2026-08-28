-- Modül 07 — KARGO KUTUSU KATALOĞU (07.12 · tasarım kaydı `docs/build/kargo-kanali-tasarimi.md §4.2`).
--
-- ── NE OLDUĞU, VE NE OLMADIĞI ───────────────────────────────────────────────
-- Bu tablo taşıyıcıya verilen DIŞ KUTUNUN tipini tutar: ölçüsü ve boş ağırlığı. Varyantın kendi
-- ambalajıyla (`product_variant.packed_*`) karıştırılmaz — o "bu ürün paketiyle ne kadar yer
-- kaplar", bu "onları içine koyduğumuz kutu ne". Gönderi ağırlığı ikisinden birlikte çıkar:
--
--     gönderi ağırlığı = Σ(ambalajlı ürün ağırlığı × adet) + kutunun darası
--     gönderi ölçüsü   = kutunun dış ölçüsü
--
-- ── DEPOYA ÖZEL, ve bu kullanıcı kararıdır (28.08) ──────────────────────────
-- *"Sistemde tanımlı varsayılan kutu ölçüleri olabilir. Fakat bu kutu ölçüleri sistemin
-- kutusudur. Her depo bu sistem kutularını kendi kutu listesine ekleyebilir veya kendisi yeni
-- kutu oluşturabilir."*
--
-- Bundan çıkan model: **`warehouse_id is null` = SİSTEM ŞABLONU.** Şablon doğrudan seçilemez;
-- depo onu benimsediğinde KENDİ SATIRI olarak kopyalanır. Junction tablosu yok, çünkü deponun
-- listesi zaten `warehouse_id = <depo>` satırlarının kendisi.
--
-- Kopyalamanın (bağlamanın değil) üç karşılığı var:
--   1. Depo kutuyu bırakabilir — `is_active` kapatır ya da satırı siler; **başka depo etkilenmez.**
--      Bağlama modelinde bir deponun bıraktığı kutu ötekilerde de yaşamaya devam ederdi ya da
--      ortak satırı silmek hepsinden birden koparırdı.
--   2. Şablon düzenlenirse benimsenmiş kutular DEĞİŞMEZ — ve bu doğru olan: Strasbourg'daki
--      fiziksel kutu, birinin şablonu düzeltmesiyle küçülmez.
--   3. Depo kutunun ölçüsünü kendi gerçeğine göre düzeltebilir (aynı isimli kutu iki depoda
--      farklı tedarikçiden gelmiş olabilir).
--
-- ── KURAL VERİDE: kutu ne ŞABLON olabilir ne BAŞKA DEPONUN ──────────────────
-- `order_box`a bileşik yabancı anahtar konuyor: `(warehouse_id, shipping_box_id)` →
-- `shipping_box (warehouse_id, id)`. Tek kısıt ikisini birden zorluyor:
--   · şablonun `warehouse_id`'si `null`, hiçbir siparişin deposuyla eşleşmez → seçilemez
--   · başka deponun kutusu farklı `warehouse_id` taşır → eşleşmez
-- Ekran unutabilir, veritabanı unutmaz (CLAUDE §1 depo değişmezi · STACK §13).

create table public.shipping_box (
  id uuid primary key default gen_random_uuid(),
  -- `null` = SİSTEM ŞABLONU (seçilemez, kopyalanır). Dolu = o deponun kendi kutusu.
  -- `restrict`: kutusu olan depo silinemez — depo zaten silinmez, susturulur (0031/0048 çizgisi).
  warehouse_id uuid references public.warehouse (id) on delete restrict,
  -- Operatörün listede gördüğü ad ("Orta kutu 40×30×20"). Ölçü adın İÇİNDE tekrarlanabilir ve bu
  -- bilinçli: depocu rafın önünde adı okur, kolonları değil.
  name text not null check (length(btrim(name)) > 0),
  -- Dış ölçü — MİLİMETRE (gerekçe `product_variant.packed_*` künyesinde: ondalık santimetre
  -- tam sayı alanında sessizce yuvarlanır ve sağlayıcı `mm`yi doğrudan kabul ediyor).
  length_mm int not null check (length_mm > 0),
  width_mm int not null check (width_mm > 0),
  height_mm int not null check (height_mm > 0),
  -- BOŞ kutunun ağırlığı. Gönderi ağırlığına eklenir; unutulursa taşıyıcı farkı faturada düzeltir.
  -- `0` meşru bir değer (poşet/zarf) — bu yüzden `>= 0`, ölçülerin `> 0` kuralından ayrı.
  tare_g int not null default 0 check (tare_g >= 0),
  -- Kutunun taşıyabileceği azami İÇERİK ağırlığı (dara hariç). `null` = sınır bilinmiyor.
  -- Sıfır DEĞİL: sıfır "hiçbir şey taşıyamaz" demek olurdu (CLAUDE §1).
  max_content_g int check (max_content_g is null or max_content_g > 0),
  -- Kutu tükendi / artık kullanılmıyor. Silmek yerine kapatmak: kapalı kutu geçmiş gönderilerde
  -- referans olarak yaşamaya devam eder (aşağıdaki `restrict`).
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  -- `order_box`taki bileşik FK'nin hedefi. `id` zaten birincil anahtar; bu çift, kutunun
  -- DEPOSUYLA birlikte doğrulanabilmesi için var.
  constraint shipping_box_warehouse_id_uq unique (warehouse_id, id)
);

-- Depo içinde ad benzersiz — iki "Orta kutu" operatöre hangisini seçeceğini sordurur.
create unique index shipping_box_name_uq on public.shipping_box (warehouse_id, name) where warehouse_id is not null;
-- Şablon adları da benzersiz. AYRI indeks çünkü `null` değerler Postgres'te birbirinden FARKLIDIR:
-- yukarıdaki indeks şablonları hiç görmez ve iki aynı adlı şablon sessizce yan yana dururdu.
create unique index shipping_box_template_name_uq on public.shipping_box (name) where warehouse_id is null;
-- Deponun listesi, sıralı — kutu seçicinin tek okuması.
create index shipping_box_warehouse_idx on public.shipping_box (warehouse_id, sort_order) where warehouse_id is not null;

alter table public.shipping_box enable row level security;
-- Politika YOK — bilinçli (0047/0048 ile aynı): tabloya yalnız service-role erişir. Müşteri
-- yüzeyinin kutu tipiyle işi yoktur; kargo ücreti ona zaten hesaplanmış olarak gider.

comment on table public.shipping_box is
  'Kargo kutusu tipi (07.12). warehouse_id null = SİSTEM ŞABLONU (seçilemez, depo benimseyince kopyalanır); dolu = o deponun kutusu. Varyantın kendi ambalajıyla (product_variant.packed_*) karıştırılmaz: o "ürün ne kadar yer kaplar", bu "onu içine koyduğumuz kutu ne".';

-- ── SİSTEM ŞABLONLARI ───────────────────────────────────────────────────────
-- Başlangıç kümesi — **ölçülmüş gerçek değil, makul varsayılan** (CLAUDE §4: parametrik değer
-- sorulmaz, makul varsayılan konur ve bildirilir). Depo benimserken kendi kutusunun gerçeğine
-- göre düzeltir; şablonun işi boş bir formdan daha iyi bir başlangıç noktası olmak.
insert into public.shipping_box (warehouse_id, name, length_mm, width_mm, height_mm, tare_g, max_content_g, sort_order) values
  (null, 'Küçük kutu 20×15×10',  200, 150, 100,  60,  5000, 0),
  (null, 'Orta kutu 30×20×15',   300, 200, 150, 130, 10000, 1),
  (null, 'Tepsi kutusu 35×25×12', 350, 250, 120, 180, 12000, 2),
  (null, 'Büyük kutu 40×30×20',  400, 300, 200, 260, 20000, 3),
  (null, 'Uzun kutu 60×20×20',   600, 200, 200, 300, 15000, 4);

-- ── SİPARİŞ KUTUSU HANGİ TİPTE (0048'e ek) ──────────────────────────────────
-- `null` = tip seçilmemiş. Rota kulvarında meşru (kutu bizim aracımıza biner, ölçüsünü kimse
-- sormaz); kargo kulvarında ise etiket satın almanın ÖN ŞARTIDIR — ölçüsüz gönderi duyurulamaz.
-- Kural uygulama katmanında yaşıyor, veride değil: rota kutusunun tipsiz kalması bir arıza değil.
--
-- `restrict`: gönderilmiş bir kutunun tipi silinemez — ölçü, o gönderinin faturasının dayanağıdır.
alter table public.order_box add column shipping_box_id uuid;
alter table public.order_box add constraint order_box_shipping_box_fk
  foreign key (warehouse_id, shipping_box_id) references public.shipping_box (warehouse_id, id) on delete restrict;

comment on column public.order_box.shipping_box_id is
  'Hangi kargo kutusu tipinde (0052). Bileşik FK deposuyla birlikte doğrular: şablon seçilemez (warehouse_id null, eşleşmez) ve başka deponun kutusu seçilemez. null = tip seçilmemiş (rota kulvarında meşru; kargoda etiketin ön şartı).';
