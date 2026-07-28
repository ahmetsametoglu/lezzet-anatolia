'use client';

import type { ReactNode } from 'react';

/**
 * Form alanlarının ortak iskeleti = **K34 · Form Alanı** (envanter): etiket → kontrol → yardım/hata.
 * Tüm `*Field` primitifleri (input/textarea/select) bunu sarar → etiket/hata markup'ı tek kaynak.
 * `hideLabel` etiketi görsel gizler (sr-only) — placeholder-yalnız tasarımlar için (ör. login).
 */
interface FieldShellProps {
  fieldId: string;
  label: string;
  hideLabel?: boolean;
  /**
   * Alan İSTEĞE BAĞLI mı — K32 zorunluluğu yıldızla anlatmıyor, tersini işaretliyor. `required`
   * yerine bu alanın olması bilinçli: yıldız kullanmadığımız için `required` bayrağının görünür
   * bir karşılığı kalmıyordu ve "var ama hiçbir şey yapmıyor" bir prop'a dönüşüyordu.
   */
  optional?: boolean;
  /** "(isteğe bağlı)" metni — sayfanın kendi dilinden gelir, primitif metin taşımaz. */
  optionalLabel?: string;
  labelAside?: ReactNode;
  error?: string;
  children: ReactNode;
}

export function FieldShell({ fieldId, label, hideLabel, optional, optionalLabel, labelAside, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        // K34: etiket 12,5px/600, gövde renginde. Girdiden bir punto küçük — etiket künye, girdi içerik.
        // Ölçü artık token (`text-field-label`); ham `text-[12.5px]` yazmak envanter §0.4'ün ölçü
        // kuralını çiğniyordu (renk kuralının ölçü karşılığı: kademe yoksa kodlanmaz, eklenir).
        className={hideLabel ? 'sr-only' : 'flex items-center justify-between font-sans text-field-label text-body'}
      >
        <span>
          {label}
          {/* K32: **zorunluluk yıldızla anlatılmaz**, İSTEĞE BAĞLI olan işaretlenir. Yıldız,
              formdaki alanların çoğu zorunlu olduğu için gürültüye dönüşüyor ve müşteriye
              hiçbir şey öğretmiyordu; asıl merak edilen "hangisini boş bırakabilirim". */}
          {optional && <span className="font-normal text-muted"> {optionalLabel}</span>}
        </span>
        {labelAside && <span className="text-note font-normal text-muted">{labelAside}</span>}
      </label>

      {children}

      {error && (
        <p className="font-sans text-note font-semibold text-terracotta-bright" id={`${fieldId}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** `${fieldId}-error` — kontrolün `aria-describedby`'ı ile FieldShell'in hata `<p>`'si aynı id'yi paylaşır. */
export function errorIdFor(fieldId: string, error?: string): string | undefined {
  return error ? `${fieldId}-error` : undefined;
}

/** Input/textarea/select ortak görünümü (Lezzet token'ları). `error` çerçeveyi kırmızıya çeker. */
/**
 * Girdi gövdesi = **K34 · Form Alanı** (envanter). Çizili künye:
 *   `48px` gövde (mobil 52) · yarıçap `14px` · odakta `2px zeytin` · hata `2px terracotta`
 *   etiket üstte `12,5px kalın` · altta yardım ya da hata satırı · salt-okunur hâl krem zemin.
 *
 * Önce ölçü K4'ten (Arama Hapı) türetilmişti — yanlıştı: K4 bir arama hapıdır (44px, yarıçap 24),
 * form alanı değil. Envanter ikisini AYRI bileşen olarak çiziyor ve dokunma hedefi tablosunda ayrı
 * satır veriyor. Ondan önce de ölçü giriş sayfasının BUTONUNDAN alınmıştı; üç turda üç yanlış
 * kaynak — kural envanterdeydi, aranmadığı için bulunamadı.
 *
 * **Yükseklik SABİT (`h-12` = 48px), ped hesabı değil.** Butonlarda olduğu gibi: ped aritmetiğiyle
 * "yaklaşık" tutturmak punto ya da satır aralığı değiştiğinde yüksekliği kaydırıyor ve alan komşu
 * düğmeyle hizasını kaybediyordu (üç turda üç farklı sonuç). `leading-tight` yine şart — tip
 * token'ları satır yüksekliği taşımıyor, kontrol o zaman gövde metninin 1.5 aralığını miras alıp
 * uzuyor (aynı tuzak K19 adet seçicide de yaşandı). Çok satırlı alanda `min-h-*` bu yüksekliği ezer.
 *
 * **Metin 15px** (`text-body`): tasarım `400 15px/20px`. 14px'e çekilmişti ve alan sitenin geri
 * kalanından bir punto küçük kalıyordu.
 *
 * **Kenar `sand-400`** (#d8cfb6) — tasarımın verdiği ton. `sand-300` (#e0d8c2) kullanılıyordu; o ton
 * envanterde salt-okunur alanın kenarı, dolayısıyla dolu alanla pasif alan aynı görünüyordu.
 *
 * **Odakta kutu ZIPLAMAZ:** kenar 1,5 → 2px'e çıkmak yerine `ring-inset` eklenir; ped hiç değişmez,
 * kenar iki katı görünür. Sonuç envanterin çizdiğiyle aynı, hesap tek.
 *
 * **Mobil 52px KALAN İŞ:** primitif cihazı bilmiyor ve `md:` akışkan responsive yasak (ADR Sapma 3).
 * 48px zaten erişilebilirlik tabanının (44px) üstünde; `size` desteği ayrı iş → `design/BACKLOG`.
 */
export function controlClass(error?: string, extra?: string): string {
  return [
    'h-12 w-full rounded-soft border-[1.5px] bg-card px-4 font-sans text-body leading-tight text-ink outline-none transition-colors placeholder:text-sand-600',
    'focus:border-olive focus:ring-[0.5px] focus:ring-inset focus:ring-olive disabled:cursor-not-allowed disabled:opacity-60',
    // Salt-okunur (ülke gibi sabit değerler): krem zemin + soluk kenar ve metin — K34'ün beşinci hâli.
    'read-only:bg-sand-50 read-only:border-sand-300 read-only:text-muted',
    error ? 'border-terracotta-bright ring-[0.5px] ring-inset ring-terracotta-bright' : 'border-sand-400',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}
