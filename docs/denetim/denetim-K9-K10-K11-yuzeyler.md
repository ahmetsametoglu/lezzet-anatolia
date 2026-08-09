# Denetim K9 + K10 + K11 — Komponentler ve iki yüzey

> Program: `denetim-katman-haritasi.md` · Tarih: 10.08.2026
> K9 `apps/web/components` 147 · 15.467 — K10 `app/(operations)` 346 · 52.774 —
> K11 `app/(customer)` 173 · 17.279
>
> **Üç katmanın yüzey disiplini kusursuz çıktı.** Aranan dört ihlalin dördü de **sıfır**.
> İki hafif kayıt var, ikisi de "yanlış" değil "adlandırma/bağlanma" düzeyinde.

---

## Sıfır çıkan dört eksen (ölçümüyle — tekrar aranmasın)

| Eksen | Kural | Ölçüm |
|---|---|---|
| Operasyonda `*.mobile` forku | Operasyon yüzeyi YALNIZ masaüstü (kullanıcı kararı 06.08) | **0 dosya** — sökülenler geri gelmemiş |
| Operasyonda Tailwind sabit renkleri | `bg-white` / `*-gray-N` karanlık modda dönmez (CLAUDE §3) | **0 kullanım** |
| Müşteride `md:` responsive | Cihaz forku var, akışkan responsive YOK (ADR Sapma 3) | **0 kullanım** |
| Ham hex | Renk `globals.css` token'ından gelir | **İhlal yok** — bulunan iki grup da meşru (aşağıda) |

**Ham hex'in iki meşru istisnası:**
- `components/customer/auth/provider-icons.tsx` — Google (`#4285F4` …) ve WhatsApp (`#25D366`)
  **marka renkleri**. Token'a girmezler: bizim paletimiz değil, üçüncü tarafın kimliği.
- `app/global-error.tsx` — kök hata sınırı, **CSS yüklenmeden** çalışır (kendi `<html>`ini basar),
  yani token okuyamaz. Inline `style` zorunlu.
- Kalanların hepsi ya yorum içinde ya `token('--color-ops-olive', '#5f7a2c')` biçiminde **yedek
  değer** — token okunamazsa devreye giren ikinci savunma, ihlal değil.

---

## K9-1 · Ölçü ekseni: iki yerde yükseklik sözlüğe bağlı değil (03.08'den beri bekleyen başlık)

Bu eksen operasyon şeridinin önerisiyle 03.08'de denetim programına girmişti ve **hiç
koşulmamıştı**. Bugün koşuldu.

**Sonuç büyük ölçüde temiz:** `CONTROL_H` (`components/operation/ui/control.ts`) 21 dosyada
kullanılıyor; kontrollerin yüksekliği sözlükten geliyor.

**İki sapma:**
- `components/operation/ui/page-header.tsx:194` → `'h-9 w-9 …'` — kare ikon buton. `h-9` değeri
  `CONTROL_H.md` ile **aynı** ama sözlüğe bağlı değil: sözlük bir gün `h-10`a çıkarsa bu buton
  yerinde kalır ve satır hizası bozulur.
- `components/operation/ui/error-state.tsx:38` → `'h-11 w-11 …'` — ikon kutusu. Bu bir kontrol
  değil (tıklanmıyor), yani sözlüğe bağlanması **tartışmalı**; kayıt olarak bırakıldı.

**Öneri:** kare kontroller için sözlüğe bir `CONTROL_SQUARE` girdisi ya da `CONTROL_H` + eşleşen
genişlik. → sahibi **operasyon şeridi**.

**Cevap (operasyon):**

---

## K10-1 · İki farklı komponent aynı adı taşıyor: `OrderDialog`

| Dosya | Props | Satır |
|---|---|---|
| `operations/orders/order-dialog.tsx` | `{ row, onClose }` | 201 |
| `operations/customers/components/order-dialog.tsx` | `{ summary, error, referenceNo, onClose }` | 171 |

**Duplikasyon değil** — props'ları ve işleri farklı (biri sipariş listesi satırından açılıyor, öteki
müşteri kartından özet+hata ile). Ortak satır 27 ve çoğu import.

**Kayıt sebebi ad:** iki farklı şey aynı adı taşıyor. Bir ajan "OrderDialog'u düzelt" talimatını
aldığında hangisini açacağını dosya yolundan çıkarmak zorunda; arama sonucu iki dosya döner ve
yanlış olanı düzeltmek sessiz bir iş kaybıdır. Ad, ait olduğu bağlamı söylemeli
(`CustomerOrderDialog` gibi).

→ sahibi **operasyon şeridi**. Düşük öncelik.

**Cevap (operasyon):**

---

## K11 — Müşteri yüzeyi: bulgu yok

Cihaz forku disiplini, i18n yerleşimi ve ad tekrarı taramalarının üçü de temiz. Klasörler arası
aynı adlı komponent yok (`page.tsx`/`loading.tsx` dışında — onlar Next'in kendi kuralı).
