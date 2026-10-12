# WhatsApp sipariş bildirimleri — mesaj sayısı ve ücret

> **Statü: ÇALIŞMA (12.10.2026).** Karar bekliyor: hangi sipariş şablonları WhatsApp'tan açılsın. Şimdilik WhatsApp'tan sipariş mesajı
> gitmiyor; kapı kodu e-postayla gidiyor, çünkü Meta şablon oluşturmayı reddediyor (`teslim-kodu.md` 7. karar). Bağlı açık iş: KALAN 15.11 (WhatsApp gönderici ve şablonlar).

## 1. Sipariş başına mesaj

Sipariş durum olayları `packages/application/src/order/notify.ts`'ten, Meta'daki onaylı şablonlar 12.10.2026'da Graph API'den okundu.

| Teslim türü | Olay | Meta şablonu | Kategori |
| --- | --- | --- | --- |
| Hepsi | Sipariş onaylandı | `order_confirmed` (tr/fr/de, onaylı) | Utility |
| Rota | Yolda | `order_out_for_delivery` (onaylı) | Utility |
| Rota, kapı kodu | Kod | `delivery_code` (ertelendi, kod e-postayla) | Authentication |
| Kargo | Kargoya verildi | `order_shipped` (onaylı) | Utility |
| Gel-al | Hazır | yok | — |
| Hepsi | Teslim edildi | `order_delivered` (onaylı) | Utility |
| İstisna | İptal, eksik, iade, ödeme tamamlanmadı | yok | — |

Sorunsuz bir siparişte üç şablon mesajı gider; kapı kodlu B2B rota siparişinde dört.

## 2. Ücret

Mesaj başına, euro, Meta tarifesi 1 Ekim 2026'dan beri geçerli. Ülke alıcının numarasından belirlenir.

| Ülke | Utility | Authentication | Marketing |
| --- | --- | --- | --- |
| Fransa | 0,0248 | 0,0248 | 0,0712 |
| Almanya | 0,0456 | 0,0456 | 0,1131 |

- Kaynak üçüncü taraf özetleri ([flowcall](https://www.flowcall.co/blog/whatsapp-business-api-pricing),
  [formbeep](https://formbeep.com/whatsapp-api-pricing/)); Almanya iki kaynakta tutarlı (dolar kartında $0,0550 / $0,1365).
  Meta'nın indirilebilir tarife dosyası doğrudan okunamadı; tarife üç ayda bir değişebiliyor.
- 1 Ekim 2026'dan beri müşteri yazdıktan sonraki 24 saat içinde giden utility şablonları da ücretli; önceden ücretsizdi.
- Türkiye numarasının tarifesi bu çalışmada ölçülmedi.

## 3. Sipariş başına tutar

| Senaryo | Fransa | Almanya |
| --- | --- | --- |
| Yalnız kod mesajı | 0,0248 € | 0,0456 € |
| "Yolda" ve kod | 0,0496 € | 0,0912 € |
| Onay, yolda, teslim | 0,0744 € | 0,1368 € |
| Onay, yolda, kod, teslim | 0,0992 € | 0,1824 € |

Aylık tutar = sipariş sayısı × satırdaki tutar; sipariş hacmi kullanıcının verisidir, burada tahmin edilmedi.

## 4. Açık karar

Onay, kargo ve teslim şablonlarının WhatsApp'tan açılması. Bugün bu haberler e-postayla ve cihaz bildirimiyle gidiyor.
