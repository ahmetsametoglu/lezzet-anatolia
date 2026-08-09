# Denetim K5 — Uygulama orkestrasyonu (`packages/application`)

> Program: `denetim-katman-haritasi.md` · Ölçü: 61 dosya · 12.440 satır · Tarih: 10.08.2026
>
> **Tek bulgu, ama katmanın en büyüğü: terfi edilmiş 13 modülün web kopyaları YAŞIYOR.**
> Künyeleri "web kopyası KÖPRÜ" diyor; ölçüm köprü olmadıklarını, tam kopya olduklarını gösteriyor.

---

## K5-1 · Terfi "aşama 1/3"te durmuş — 13 modül iki yerde paralel yaşıyor ⚡

**Ölçüm.** `packages/application/src` ile `apps/web/lib` arasında 33 aynı adlı dosya var. 16'sı
gerçek köprü (`@lezzet/application`'dan re-export). Kalan **17'si kendi kodunu taşıyor** ve
13'ünde web'in export'larının **tamamı** application'da da tanımlı:

| Modül | Ortak export | Web satır |
|---|---|---|
| `customer-orders.ts` | 6/6 | 320 |
| `settings-keys.ts` | 6/8 | 67 |
| `invite.ts` | 5/5 | 174 |
| `day.ts` · `refund.ts` · `ticket-types.ts` | 4 | 241 · 260 · 140 |
| `day-close.ts` | 3/3 | 80 |
| `discount.ts` · `fulfillment.ts` · `place-change.ts` · `proof.ts` | 2/2 | 208 · 62 · 84 · 94 |
| `carrier.ts` · `settle.ts` | 1/1 | 32 · 48 |

Toplam **42 ortak export**, web tarafında ~1.800 satır.

**Künye ile gerçek ayrışmış.** `packages/application/src/cart/discount.ts` künyesi aynen şöyle:

> **TERFİ (aşama 1/3)** — kaynağı `apps/web/lib/cart/discount.ts`tı; web kopyası **KÖPRÜ**.

Ama `apps/web/lib/cart/discount.ts` köprü değil: 208 satır tam implementasyon, `server-only`
korumasıyla. İki dosya arasındaki tüm fark **8 satır** (biri `server-only` importu, diğeri
application künyesindeki terfi notu).

**Ve ikisi de canlı kullanılıyor:**
- `apps/web/lib/cart/read.ts:20` → `import { resolveCartDiscount } from './discount'` (**web kopyası**)
- `packages/application/src/index.ts:253` → `export { resolveCartDiscount } from './cart/discount'`
  (**paket kopyası**, mobil arka ucun tükettiği)

**Somut risk — aynı soruya iki cevap.** Kupon çözümü müşterinin web sepetinde bir dosyadan, native
uygulamada başkasından geliyor. Birinde düzeltilen bir hata ötekinde kalır ve **hiçbir test bunu
yakalayamaz**: iki dosyanın da kendi testi var, ikisi de yeşil. Belirti son kullanıcıda çıkar —
"web'de kupon geçti, uygulamada geçmedi". Aynı sınıf risk `refund` (para iadesi), `day-close` (kasa
mutabakatı) ve `proof` (teslimat kanıtı) için de açık.

**Bu bir yön hatası değil, yarım kalmış bir göç.** Terfi kararı doğru ve talep dosyasıyla
kapanmıştı (`musteri-application-storefront-benimseme`, 08.08); yapılmayan şey **aşama 2/3**: web
kopyalarının köprüye indirgenmesi. Künyenin "köprü" demesi de bunu doğruluyor — niyet buydu.

**Öneri:** her modül için web dosyası tek satıra insin:
`export { … } from '@lezzet/application';` — kod tek yerde kalsın. `discount.test.ts` gibi web
tarafındaki testler de paket tarafına taşınsın (aksi hâlde köprüyü test eder hâle gelirler).

**Sıra önerisi (riske göre):** `refund` → `discount` → `day-close` → `proof` → kalanlar. Para ve
kupon önce; ikisinde ayrışma doğrudan yanlış tutar demek.

**Sahibi:** modül modül dağınık (müşteri · operasyon · arka uç) → **koordinasyon defterine de
yazıldı**; sıralamayı web sorumlusu (denetim) izler.

**Cevap:**

---

## Temiz çıkan eksenler

| Eksen | Sonuç |
|---|---|
| Devam eden iş | `packages/application/src` altında untracked dosya **yok** — yani bu 13 ikiz yarım bırakılmış bir iş değil, kapanmış sayılan bir işin kalıntısı |
| Köprü disiplini | 16 modül doğru köprülenmiş (`points` · `featured` · `places` · `packages` …) — desen biliniyor ve uygulanabiliyor, sadece 13 yerde tamamlanmamış |
