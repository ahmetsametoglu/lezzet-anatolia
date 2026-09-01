import messages from './messages.json';

/*
  OPERASYON YÜZEYİNİN METİNLERİ — TEK DİLLİ SÖZLÜK, dil ekseni YOK.

  ── Karar ve gerekçe (CLAUDE §2: "Operasyon yüzeyi yalnız Türkçe") ───────────
  Müşteri yüzeyinde `messages.json` DİLE GÖRE anahtarlıdır (`{ tr, fr, de }`) ve tip
  `LocalizedCopy<typeof messages>` ile o zarftan türer; ekran `messages[useAppLocale()]` der
  (emsal: `app/(tabs)/_layout.tsx`). Burada o zarf BİLEREK yok:

  · `LocalizedCopy<T>` `T extends Record<Locale, unknown>` ister — üç dilin ÜÇÜNÜ de zorunlu
    kılar. Operasyon sözlüğünü o kalıba sokmak, ya asla okunmayacak iki Fransızca/Almanca kopya
    yazmak (ölü metin, üstelik çürüyen) ya da tipi gevşetmek demekti.
  · Zarfın YOKLUĞU bir bilgidir: dosyayı açan "bu yüzeyin dil ekseni yok" bilgisini şeklinden
    okur. `{"tr": {...}}` diye tek anahtarlı bir zarf ise dil ekseni VARMIŞ da eksik kalmış gibi
    görünürdü.
  · `useAppLocale()` bu yüzeyde HİÇ ÇAĞRILMAZ — kullanıcı Français seçse de operasyon Türkçedir.

  ── Peki neden hâlâ bir JSON dosyası? ───────────────────────────────────────
  Web operasyonu metinleri doğrudan JSX'e yazıyor (`apps/web/app/(operations)`ta tek bir
  `messages.json` yok — ölçüldü) ve bu yüzey de tek dilli olduğuna göre aynısı yapılabilirdi.
  Yapılmadı, çünkü BU kabukta aynı metin birden çok yerde geçiyor: bölüm adları ("Kurye", "Depo",
  "Yönetim", "Para") hem sekme çubuğunda, hem bildirim satırının "bölüm" alanında, hem de kapsam
  cümlesinde kullanılıyor. Üç yere elle yazılan bir ad, üçüncüsü unutulduğu gün ayrışır (CLAUDE §1).
  Dosya ayrıca kolokasyon kuralını da korur: metin, onu kullanan ekranın yanında durur.

  TİP JSON'DAN TÜRER, elle interface YAZILMAZ (CLAUDE §2'nin asıl hükmü): `typeof messages`.
*/

/** Ekran metinleri — tek dil, tek kaynak. Tip `typeof operationsCopy` ile yerinde okunur. */
export const operationsCopy = messages;

/**
 * `{n}` / `{sections}` gibi yuvaları doldurur — müşteri tarafındaki `t.card.options.replace('{n}', …)`
 * kalıbının adı konmuş hâli. Şablonun kendisi sözlükte durur ki cümlenin sırası (Türkçede sayı
 * önce mi sonra mı) koda değil metne ait kalsın.
 *
 * ── DOLMAYAN YUVA SESSİZ GEÇMEZ (01.09 · kullanıcı bulgusu) ─────────────────
 * Kurye gün ekranında iki cümlenin anahtarları karışmıştı ve ekranda ham `{driving}`,
 * `{loaded}/{total}` yazıyordu — testi olmayan bir gövdede günlerce yaşadı. Fonksiyon eksik
 * anahtarı DÜZELTMEZ (cümlenin nasıl kurulacağını bilmiyor) ama geliştirmede BAĞIRIR: yuva bir
 * söz ve karşılığı yoksa bunu ilk gören kişi kurye olmamalı.
 *
 * Üretimde sessiz: metin yine döner, ham yuvayla — yarım bir cümle, çöken bir ekrandan iyidir.
 */
export function fillCopy(template: string, values: Record<string, string>): string {
  const filled = Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    template,
  );
  if (__DEV__) {
    const kalan = filled.match(/\{[a-zA-Z]\w*\}/g);
    if (kalan !== null) {
      // eslint-disable-next-line no-console -- yalnız geliştirme; `logger` istemci paketinde yok.
      console.warn(`fillCopy: doldurulmayan yuva ${kalan.join(', ')} — şablon: "${template}"`);
    }
  }
  return filled;
}
