# Runbook — öksüz ve hayalet gönderi

> **Ne zaman okunur:** `/operations/system` ekranında `shipment_orphan` işinden bir uyarı
> göründüğünde. Uyarı haftada bir koşan mutabakat turundan gelir (pazartesi 05:50, Paris).
>
> **Bu turun hiçbir şeyi DÜZELTMEDİĞİNİ bilerek okuyun.** Tespit otomatik, müdahale elle — ve
> bu bilinçli: yolda olan bir koliyi otomatik iptal etmek, teslim edilecek malı yolundan çevirmek
> demektir. Gerçek para, gerçek müşteri.

## İki arıza, iki ayrı yön

| | ne demek | nasıl doğar |
|---|---|---|
| **öksüz** | Sağlayıcıda gönderi VAR, bizde satırı YOK | Duyuru çağrısı başarılı oldu (koli açıldı, etiket üretildi, para işledi) ama cevabı yazarken süreç düştü |
| **hayalet** | Bizde duyurulmuş görünüyor, sağlayıcıda YOK | Sağlayıcı tarafında elle silinmiş/iptal edilmiş, ya da satır elle yazılmış |

Öksüz **pahalıdır**: ödenmiş bir etiket kayıt dışıdır ve o koli müşteriye gidiyorsa siparişin durum
zinciri hiç işlemez. Hayalet **yanıltıcıdır**: müşteriye verilmiş takip numarasının karşılığı yoktur.

## Eşleşme neye göre yapılıyor

Duyuru sırasında sağlayıcıya kendi `shipment.id`'mizi `external_reference_id` olarak yazıyoruz
(`packages/application/src/shipping/announce.ts`). Mutabakat bunu karşılaştırır — sağlayıcının
kendi kimliğini değil. Gerekçe: o kimliği ancak **yazabilseydik** biliyor olurduk; öksüzlük tam da
yazamadığımız hâldir.

## Uyarıyı okumak

Uyarının bağlamında (`error_log.context`) şunlar durur:

- `orphans` — **sağlayıcının** gönderi kimlikleri (bizde satırı yok, başka kimliği de yok)
- `ghosts` — **bizim** `shipment.id`'lerimiz
- `truncated` — `true` ise sağlayıcı listesi sonuna kadar taranamadı; **sayılar eksiktir** ve
  "başka öksüz yok" diye okunamaz. Ayrı bir uyarı satırı olarak da düşer.

En fazla 20 kimlik yazılır (kayıt okunabilir kalsın). Tamamı için turu elle koşturun.

## Öksüz — adım adım

1. **Sağlayıcı panelinde gönderiyi açın.** Alıcı adresi ve sipariş numarası (`order_number`) hangi
   siparişimize ait olduğunu söyler.
2. **O siparişin bizdeki hâline bakın:** gönderisi var mı, kutularında takip numarası yazılı mı?
   ```sql
   select s.id, s.status, s.provider_shipment_id, b.box_no, b.provider_parcel_ref, b.tracking_number
     from public.shipment s
     right join public.order_box b on b.shipment_id = s.id
    where b.order_id = '<sipariş kimliği>';
   ```
3. **Koli fiziksel olarak gitti mi?** Panelde durumu `ANNOUNCED`ın ötesindeyse taşıyıcı almıştır.
   - **Gitmediyse ve sipariş hâlâ hazırlıktaysa:** panelden iptal edin, sonra duyuruyu normal
     akıştan tekrarlayın. Bu en temiz yoldur — iki koli açılmaz.
   - **Gittiyse:** İPTAL ETMEYİN. Satırı elle tamamlayın (aşağıdaki sorgu), sonra durum turunu
     koşturun; zincir kendiliğinden yakalar.
4. **Satırı elle tamamlama** — kimlikleri panelden alın:
   ```sql
   -- Gönderi satırı (order_id ve warehouse_id sipariştendir)
   insert into public.shipment (order_id, warehouse_id, status, provider_shipment_id, shipping_option_code, carrier_code, carrier_name)
   values ('<sipariş>', '<depo>', 'created', '<sağlayıcı gönderi kimliği>', '<servis kodu>', '<taşıyıcı>', '<taşıyıcı adı>')
   returning id;

   -- Kutuyu bağla (her koli için)
   update public.order_box
      set shipment_id = '<yukarıdaki id>', provider_parcel_ref = '<koli kimliği>', tracking_number = '<takip no>'
    where id = '<kutu kimliği>';
   ```
5. **Durumu uzlaştırın:** takılı gönderi turu saat başı koşuyor (`:25`), beklemek yeter. Acele
   varsa gönderiyi terminal olmayan bir duruma bırakıp turun gelmesini bekleyin — elle durum
   yazmayın, uzlaştırma sağlayıcıdan okuyup deftere de yazar.

## Hayalet — adım adım

1. **Gerçekten yok mu, yoksa pencerenin dışında mı?** Tarama son 8 günü okuyor. Daha eski bir
   gönderi listede olmadığı için hayalet görünebilir — panelde kimliğiyle aratın.
2. **Panelde de yoksa:** sağlayıcı tarafında silinmiş demektir. Gönderiyi `cancelled` işaretleyin
   ve **siparişi elle çözün** — müşteriye verilmiş bir takip numarası varsa yenisi gerekir.
   ```sql
   update public.shipment set status = 'cancelled', cancelled_at = now() where id = '<gönderi>';
   ```
3. Sipariş hâlâ sevk edilecekse duyuruyu normal akıştan tekrarlayın (kapı ikinci duyuruyu ancak
   iptal edilmiş gönderiden sonra kabul eder).

## Turu elle koşturmak

Mutabakat ve nöbet turları backend süreci içinde koşuyor; elle tetiklemek için süreçte
`shipmentOrphanJob` / `shipmentWatchJob` çağrılır. Sağlayıcı anahtarı yoksa iki tur da kendini
atlar ve `skipped: 'not_configured'` yazar — **sessiz geçmez.**

## Ne YAPILMAZ

- **Otomatik iptal yazmayın.** Bu turun tek işi tespittir; ilk "küçük bir yardımcı" o kuralı deler.
- **`shipment_event`e elle satır yazmayın.** Defter append-only ve taşıyıcının söylediğini tutar;
  bizim tahminimizi değil.
- **Uyarıyı susturmayın.** Tekrarlayan bir uyarı bir gürültü değil, kapanmamış bir kaydın işaretidir.
