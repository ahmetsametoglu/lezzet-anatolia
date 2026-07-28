-- Modül 12 — Muhasebe export zemini (12.7). DOMAIN §9, data-model/musteri-siparis.md.
--
-- Muhasebeye giden veri "hangi siparişler" değil "hangi SATIŞLAR" sorusunun cevabıdır: sipariş
-- kayıt anında değil, GERÇEKLEŞTİĞİ anda gelirdir. O an sipariş tablosunda YAZMAZ — `order_status_log`
-- zaten teslim/kapanış anını tutuyor ve 0015 bunu bilerek böyle kurmuştu ("ayrı `delivered_at`
-- kolonu tutulmaz"). Bu görünüm o türetimin TEK yeridir; export da (12.7) dönemsel kârlılık da
-- (12.6) aynı tarihi okusun, iki rapor iki ayrı "satış günü" hesaplamasın.

-- ── Gerçekleşmiş satış ───────────────────────────────────────────────────────
-- `sale_date` = siparişin İLK gerçekleşme anı. `min(...)` şart: tam yolda sipariş önce `delivered`
-- sonra `completed` olur ve ikisi farklı aya düşebilir. Kapanışı esas alsaydık ocakta teslim edilmiş
-- bir satış şubat cirosuna yazılırdı. Hızlı satışta (kapı önü) tek log vardır, `completed`.
--
-- HEDİYE SİPARİŞ BURADA DIŞLANMAZ: patron ikramı gelirdir, kârdır, kasaya girer — yalnız dış
-- muhasebeye gitmez (DOMAIN §9). Süzgeç export kapısındadır; burada dışlansaydı `is_gift_order`
-- "yalnız export filtresini etkiler" kuralı sessizce genişler, hediye siparişler bu görünümü okuyan
-- her rapordan (12.6 kârlılık dahil) düşerdi.
--
-- `returned` DIŞARIDA: mal geri gelmiş, para iadesi süreci açık (07.9). Sipariş `completed`'a
-- dönünce satış yine bu görünüme girer ve `sale_date` ORİJİNAL teslim günüdür — geçmiş dönemin
-- raporu yeniden üretildiğinde satır doğru aya oturur.
-- `o.*`: görünüm siparişin ALANLARINI yeniden yazmaz, yalnız `sale_date`i ekler — şema da öyle
-- türetilir (`OrderSchema.extend({saleDate})`). Alan listesi kopyalasaydık `order`a eklenen her
-- kolon burada da elle eklenmeyi beklerdi ve unutulan kolon sessizce eksik kalırdı.
create or replace view public.order_sale as
select o.*,
       s.sale_date
  from public."order" o
  join (
    select order_id, min(created_at)::date as sale_date
      from public.order_status_log
     where to_status in ('delivered', 'completed')
     group by order_id
  ) s on s.order_id = o.id
 where o.status in ('delivered', 'completed');
