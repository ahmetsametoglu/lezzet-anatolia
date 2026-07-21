# Veri Modeli

Bu dosya varlıkları ve alanlarını tanımlar. Kaynak: Zod şemaları (`packages/types`) ve migration'lar (`supabase/migrations`). Kural (blueprint STACK §5): tip elle yazılmaz, şemadan türer; alan adları camelCase, veritabanı snake_case.

Aşağıdaki alan listeleri **başlangıç** niteliğindedir; kod yazıldıkça netleşir. Kod ile bu dosya çelişirse kod haklıdır.

---

## Çok dilli alanlar

Kullanıcı/admin tarafından girilen, çevrilmesi gereken metin alanları **jsonb** olarak `{ fr, de, tr }` biçiminde tutulur.

```ts
const LocalizedText = z.object({
  fr: z.string().optional(),
  de: z.string().optional(),
  tr: z.string().optional(),
}).refine(v => v.fr || v.de || v.tr, { message: 'En az bir dil zorunlu' });
```

- En az bir dil dolu olmalı; üçü birden zorunlu değil.
- Gösterimde yedek zinciri: seçili dil → **TR → FR → DE** (bkz. `SEO_I18N.md`).
- Çeviri AI ile önerilir, zorunlu değil (bkz. `SEO_I18N.md`).

Statik arayüz metinleri bu modele girmez — onlar kod içi i18n dosyalarındadır.

---

## Varlıklar

### Product (ürün)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | LocalizedText (jsonb) | çok dilli |
| description | LocalizedText (jsonb) | çok dilli |
| category_id | uuid | |
| image_key | string \| null | depo anahtarı, tam URL değil (blueprint STACK §5) |
| vat_rate | number | ürün bazında KDV (5.5 / 20) |
| is_active | boolean | |
| sort_order | int | |
| created_at | timestamptz | |

Fiyat **ayrı** tutulur (aşağıda), çünkü kanal ve müşteriye göre değişir.

### Price (fiyat)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| product_id | uuid | |
| channel | enum(`b2b`,`b2c`) | kanal fiyatı |
| customer_id | uuid \| null | doluysa müşteriye özel fiyat |
| amount | number | |
| currency | enum(`EUR`) | |
| valid_from | timestamptz | |

### Stock (stok partisi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| product_id | uuid | |
| physical_qty | number | fiili |
| reserved_qty | number | ayrılmış |
| dlc | date | son kullanma tarihi |
| location | string \| null | depo konumu |

`available = physical − reserved` **türetilir**, saklanmaz (bkz. `DOMAIN.md §4`).

### Customer (müşteri)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| type | enum(`individual`,`company`) | kanal bunu belirler |
| company_info | jsonb \| null | vergi no vb. — doluysa B2B |
| name | string | |
| email | string \| null | |
| phone | string \| null | |
| preferred_language | enum(`tr`,`fr`,`de`) | |
| country | enum(`FR`,`DE`) | |
| addresses | (ayrı tablo) | |
| created_at | timestamptz | |

### Address (adres)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| line1, line2, postal_code, city, country | string | |
| in_route | boolean (türetilebilir) | posta koduna göre rota içi mi |

### Order (sipariş)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| channel | enum(`b2b`,`b2c`) | otomatik, değişmez |
| status | enum | bkz. `ORDER_LIFECYCLE.md` |
| payment_status | enum(`pending`,`paid`,`partial`,`refunded`) | ayrı eksen |
| payment_method | enum(`online`,`cash`,`card`,`cheque`) \| null | |
| delivery_type | enum(`route`,`shipping`) | rota içi / kargo |
| reference_no | string | sistemin ürettiği referans (resmî fatura no değil) |
| invoice_no | string \| null | dış muhasebeden sonradan eşleşir |
| total | number | |
| created_at | timestamptz | |

### OrderItem (sipariş kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| product_id | uuid | |
| qty | number | |
| unit_price | number | **sabitlenmiş** fiyat (sepete eklenince) |
| vat_rate | number | o anki oran |

### CourierDayClose (kurye gün kapanışı)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| courier_id | uuid | |
| date | date | |
| delivered_orders | uuid[] / ilişki | |
| collected_cash | number | |
| collected_card | number | |
| collected_cheque | number | |
| returns | ilişki | |
| reconciled | boolean | fark var/yok |

### Setting (işletme ayarı)

Parametrik değerler (minimum sepet, ücretsiz kargo eşiği, DLC uyarı eşiği, KDV varsayılanları). Tek satırlık ayar tablosu + önbellekli çözücü (blueprint STACK §10). Env'e veya koda gömülmez.

---

## Enum'lar (özet)

- `channel`: b2b, b2c
- `order_status`: draft, confirmed, preparing, ready, out_for_delivery, delivered, completed, cancelled, returned
- `payment_status`: pending, paid, partial, refunded
- `payment_method`: online, cash, card, cheque
- `delivery_type`: route, shipping
- `customer_type`: individual, company
- `language`: tr, fr, de
- `country`: FR, DE

---

## Kalıcı kararlar (veri modeli)

- **Kanal alanı siparişe yazılır ve değişmez** — sonradan raporlama ve audit için.
- **Kullanılabilir stok saklanmaz**, türetilir.
- **unit_price sipariş kalemine kopyalanır** — fiyat sabitleme; ana fiyat değişse de sipariş etkilenmez.
- **reference_no ≠ invoice_no** — resmî fatura numarası dış sistemde üretilir.
