# Sipariş Yaşam Döngüsü

Sipariş, sistemin en çok referans verilen ve en karmaşık varlığıdır. Bu dosya durumları ve **izin verilen geçişleri** tanımlar.

## Temel ilke: esnek geçişler

Sipariş **katı bir zincir değildir.** Durumlar zorunlu bir sıra oluşturmaz; bir "izin verilen geçişler kümesi" vardır. Aynı sipariş varlığı iki farklı yoldan geçebilir:

- **Tam yol** — uzaktan sipariş: onaydan teslimata kadar tüm adımlar.
- **Hızlı satış yolu** — kapı önü: tek adımda tamamlanır ve ödenir.

İkisi de aynı `orders` tablosunu ve aynı durum alanını kullanır; yalnızca farklı geçişlerden geçerler.

## Durumlar

| Durum | Anlam |
| --- | --- |
| `draft` | Sepet/oluşturuluyor, henüz onaylanmadı |
| `confirmed` | Müşteri onayladı; stok ayrıldı |
| `preparing` | Depoda hazırlanıyor |
| `ready` | Hazır, sevkiyat/teslim bekliyor |
| `out_for_delivery` | Yolda (rota) veya kargoya verildi |
| `delivered` | Teslim edildi |
| `completed` | Kapandı (ödeme ve teslim tamam) |
| `cancelled` | İptal (stok geri bırakıldı) |
| `returned` | İade/hasar süreci |

> Ödeme durumu **ayrı** bir eksendir (bkz. `DOMAIN.md §7`): `pending / paid / partial / refunded`. Bir sipariş `delivered` olup ödeme `pending` olabilir (kapıda ödeme bekliyor). İki eksen bağımsız yürür.

## İzin verilen geçişler (tam yol)

```
draft → confirmed → preparing → ready → out_for_delivery → delivered → completed
```

Ek geçişler:
- `confirmed / preparing / ready → cancelled` (stok geri bırakılır — depo çıkışıysa depoya girişte)
- `out_for_delivery → ready` (**ulaşılamadı** — yeniden teslim; mal ayrılmış kalır)
- `out_for_delivery → returned` (**reddedildi** — mal depoya döner)
- `delivered → returned` (teslim sonrası iade/hasar)
- `returned → completed` (iade süreci kapanışı: depo aksiyonu — restok/imha — ve para iadesi tamamlanınca sipariş kapanır; kalıcı `returned`'da kalmaz)

**İptalde para kuralı:** ödenmiş sipariş iptal edilirse tutarın **tamamı otomatik iade** edilir; iptal edilen siparişte karşılanan tutar **0 sayılır** — `payment_status` türetimi buna göre `refunded` olur (hiç ödenmemişse `pending` kapanır).

## Hızlı satış yolu

Kapı önü satışı için ara adımlar **atlanabilir**:

```
draft → completed   (stok fiiliden anında düşülür, ödeme anında alınır)
```

Bu yolda `confirmed/preparing/ready/out_for_delivery` durumlarına uğranmaz. Tek ekranda: ürün seç → ödeme al → kapat. Stok rezervasyonu yapılmaz; fiili stoktan doğrudan düşülür (bkz. `DOMAIN.md §4`). `reference_no` bu yolda `completed`'a geçişte üretilir (kural: **ilk kalıcı durum**).

## Atlanabilir adımlar

- `preparing` ve `ready` bazı durumlarda atlanabilir (küçük sipariş, anında hazır).
- `out_for_delivery`, kargo yerine kapıda teslimde farklı işaretlenir ama yine kaydedilir.
- Kural: **geçiş serbestse de her geçiş kaydedilir** (audit). "Atlandı" demek "iz bırakmadı" demek değildir; durum değişimi zaman damgasıyla loglanır (`OrderStatusLog`: from/to/kim/ne zaman — teslim anı, kapanış anı ve geri bildirim zamanlaması buradan türetilir).

## Stok etkileşimi (özet)

| Geçiş | Stok etkisi |
| --- | --- |
| `→ confirmed` | Ayrılmışa ekle (rezervasyon) |
| `→ delivered` (tam yol) | Ayrılmıştan düş + fiiliden düş |
| `→ completed` (hızlı satış) | Fiiliden doğrudan düş |
| `→ cancelled` | Ayrılmıştan geri bırak |
| `→ returned` | Karara göre fiiliye geri ekle veya imha işaretle |

> **Rezervasyon serbest bırakma depoya çıpalıdır:** `cancelled`/`returned` stok etkisi mal **fiziksel olarak depoya geri girdiğinde** işler — kapıda değil. `out_for_delivery → ready` (ulaşılamadı) stoğu değiştirmez; mal ayrılmış kalır. Ayrıntı: `DOMAIN.md §4`.

## Sipariş kaynağı ve yaşam döngüsü

`order_source` (`web`/`whatsapp`/`door`/`manual`) **durum geçişlerini değiştirmez** — yalnızca siparişi *oluşturan yüzeyi* söyler (bkz. `CHANNELS.md §2`).

- **web / whatsapp** → tam yol (`draft → confirmed → … → completed`). WhatsApp siparişi zemin adımında admin tarafından elle `draft` açılır; canlı adımda AI ajanı aynı `draft`'ı üretir. Durum makinesi ikisinde de aynıdır.
- **door** (kapı önü) → hızlı satış yolu (`draft → completed`), stok fiiliden anında düşülür.
- **manual** → telefon/DM'den gelenin elle işlenmesi; tam yol.

Yani kaynak yeni bir durum yolu açmaz; mevcut iki yoldan (tam / hızlı) birini kullanır. Ödeme yine `payment_status` ekseninden yürür (WhatsApp'ta Stripe payment link, web'de checkout, kapıda nakit/kart).

## Uygulama notu

- Geçiş kuralları tek yerde tanımlanır (domain motoru — bkz. `STACK.md §8`), bileşenlerin içine dağıtılmaz.
- İzin verilmeyen geçiş denemesi bir hata değeridir (`{ data, error }`), fırlatma değil.
- Durum makinesi kuralları veri değil kod olarak yaşar; ama izin verilen geçiş tablosu test edilebilir saf bir yapıdır (motorun birim testi).
- Kısmi karşılama (eksik ürün) **yeni durum açmaz**: `OrderItem.fulfilled_qty` + tahsilat/iade tutarları taşır, `payment_status` bunlardan türetilir (bkz. `DOMAIN.md §8`).
- **Teslim sonrası kısmi iade de yeni durum açmaz:** sipariş `delivered/completed` kalır; ilgili kalemin `fulfilled_qty`'si düşürülür + fark iade edilir (indirimli birim fiyattan). `returned` yalnız siparişin bütün olarak iade sürecine girdiği durumdur.
