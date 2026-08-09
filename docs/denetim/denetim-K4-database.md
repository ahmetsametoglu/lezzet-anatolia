# Denetim K4 — Veritabanı servisleri (`packages/database`)

> Program: `denetim-katman-haritasi.md` · Ölçü: 52 servis · 95 dosya · 16.262 satır · Tarih: 10.08.2026
> Ölçüt: `STACK §6` (ham `this.supabase` ne zaman serbest — TS2 turunda yazıldı) + `CLAUDE §1`.
>
> **Sayfalama disiplini kusursuz:** 13 serviste keyset, **`.range()` kullanan tek servis yok**.
> Ham kullanımların iki mutlak yasağı (tabanı atlayarak kendi tablosuna yazmak · `parseRows`'u
> atlayan entity okuması) taranmış hâliyle **ihlalsiz**. İki duplikasyon bulundu.

---

## K4-1 · "Grup içinde tek bayrak" algoritması iki serviste birebir yazılı

`address.service.ts:33` ile `supplier.service.ts:128` **satır satır aynı**:

```ts
async setDefault(id)                         async setPreferred(id)
  const x = await this.getById(id)             const x = await this.getById(id)
  if (!x) throw new Error(`… bulunamadı`)      if (!x) throw new Error(`… bulunamadı`)
  this.supabase.from('address')                this.supabase.from('supplier_product')
    .update({ is_default: false })               .update({ is_preferred: false })
    .eq('customer_id', x.customerId)             .eq('variant_id', x.variantId)
  return this.update({ id, isDefault: true })  return this.update({ id, isPreferred: true })
```

Değişen yalnız üç ad: tablo, bayrak kolonu, kapsam kolonu. **Algoritma aynı** — kardeşleri temizle,
kendini işaretle.

**Neden şimdi taşınmalı:** `STACK §6`'nın kendi eşiği bu — *"Tabanı genişletmek varsayılan değil:
bir operatörün **ikinci** tüketicisi çıkınca taşınır."* İkinci tüketici çıkmış durumda. Üçüncüsü de
yolda görünüyor: aynı desen `is_primary`/`is_active` gibi her "grup içinde tek" kuralında doğar.

**Ek risk — ikisi de ATOMİK DEĞİL:** iki ayrı yazım arasında hata olursa grup **bayraksız** kalır
(kardeşler temizlendi, yenisi işaretlenmedi). Tek yere taşınırsa bu da tek yerde çözülür.

**Öneri:** `BaseDbService`'e `protected setExclusiveFlag(id, flagField, scopeField, scopeValue)`.
→ sahibi **arka uç şeridi**.

**Cevap (arka-uc):**

---

## K4-2 · Aynı iş iki yoldan: biri taban metodunu kullanıyor, öteki ham yazıyor

| Servis | Metot | Yol |
|---|---|---|
| `product-feedback.service.ts:198` | `markArrivalNotified` | `this.updateWhereIn('id', ids, { notifiedAt: at })` ✔ |
| `zone-notice.service.ts:85` | `markNotified` | `this.supabase.from('zone_notice').update({ notified_at: at }).in('id', …)` |

İkisi de "şu kimliklere bildirim damgası bas" diyor. Taban metodu (`updateWhereIn`, `base.service.ts:543`)
tam bunun için var ve **tek tüketicisi kalmış**.

**Ham olanın somut riski:** taban `toDbRow` çevriminden geçiyor (`notifiedAt` → `notified_at`); ham
sürüm kolon adını **elle** yazıyor. Kolon yeniden adlandırılırsa taban kullananlar derleme
zamanında kırılır, ham yazan **çalışma zamanında** — ve bu yol bir cron işinin içinde, yani hata
kullanıcının önüne değil log'a düşer.

`STACK §6`'nın meşru dört sınıfından hiçbirine de girmiyor: görünüm okuması değil, çapraz-tablo
türetimi değil, tabanın taşımadığı operatör değil (`in` taban metodunda zaten var), sözlük dönüşü değil.

**Öneri:** `zone-notice` de `updateWhereIn`'e geçsin. → sahibi **arka uç şeridi**.

**Cevap (arka-uc):**

---

## Temiz çıkan eksenler

| Eksen | Ölçüm | Sonuç |
|---|---|---|
| Sayfalama | 13 keyset · 0 `.range()` | Ölçüt "liste olmak değil sınırsız büyümek" (CLAUDE §1) — ihlal yok |
| Ham yazma yasağı | 13 ham yazım incelendi | Hiçbiri "tabanı atlayarak kendi tablosuna tek satır yazma" değil: 4'ü `assistant_proposal` durum geçişi (koşullu `update` — yarış için ŞART, taban yüzeyi karşılamıyor), 3'ü taban `insert`i (grep yanılgısı), kalanı toplu/kapsamlı yazım |
| `rpc` kullanımı | 2 servis | Ham zorunlu sınıf — meşru |
| Ham okuma / `parseRows` | tarandı | Entity döndürüp `parseRows` atlayan okuma bulunamadı (`findByProviderRef` vakası 02.9'da kapanmış, tekrarı yok) |
