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
- `confirmed / preparing / ready → cancelled` (stok geri bırakılır)
- `delivered → returned` (iade/hasar)
- `out_for_delivery → ready` (teslim edilemedi, geri döndü)

## Hızlı satış yolu

Kapı önü satışı için ara adımlar **atlanabilir**:

```
draft → completed   (stok fiiliden anında düşülür, ödeme anında alınır)
```

Bu yolda `confirmed/preparing/ready/out_for_delivery` durumlarına uğranmaz. Tek ekranda: ürün seç → ödeme al → kapat. Stok rezervasyonu yapılmaz; fiili stoktan doğrudan düşülür (bkz. `DOMAIN.md §4`).

## Atlanabilir adımlar

- `preparing` ve `ready` bazı durumlarda atlanabilir (küçük sipariş, anında hazır).
- `out_for_delivery`, kargo yerine kapıda teslimde farklı işaretlenir ama yine kaydedilir.
- Kural: **geçiş serbestse de her geçiş kaydedilir** (audit). "Atlandı" demek "iz bırakmadı" demek değildir; durum değişimi zaman damgasıyla loglanır.

## Stok etkileşimi (özet)

| Geçiş | Stok etkisi |
| --- | --- |
| `→ confirmed` | Ayrılmışa ekle (rezervasyon) |
| `→ delivered` (tam yol) | Ayrılmıştan düş + fiiliden düş |
| `→ completed` (hızlı satış) | Fiiliden doğrudan düş |
| `→ cancelled` | Ayrılmıştan geri bırak |
| `→ returned` | Karara göre fiiliye geri ekle veya imha işaretle |

## Uygulama notu

- Geçiş kuralları tek yerde tanımlanır (domain motoru — bkz. `STACK.md §8`), bileşenlerin içine dağıtılmaz.
- İzin verilmeyen geçiş denemesi bir hata değeridir (`{ data, error }`), fırlatma değil.
- Durum makinesi kuralları veri değil kod olarak yaşar; ama izin verilen geçiş tablosu test edilebilir saf bir yapıdır (motorun birim testi).
