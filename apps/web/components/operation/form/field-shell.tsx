import type { ReactNode } from 'react';
import { AssistantField } from './assistant-field';
import { CONTROL_H, type ControlSize } from '../ui/control';

/**
 * Operasyon form iskeleti — Komponent Envanteri O8. Customer `FieldShell` deseninin operasyon ikizi
 * (Veri Masası token'ları): etiket (+ `*`/`labelAside`) → kontrol → hata `<p role="alert">`. Etiket/
 * hata/aria markup'ı TEK KAYNAK; tüm `*Field` primitive'leri (input/textarea) bunu sarar. Select/
 * MultiToggle/MultiSelect gibi custom kontroller de `label`+`error` için bununla sarılabilir.
 */
interface FieldShellProps {
  fieldId?: string;
  label: ReactNode;
  required?: boolean;
  labelAside?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  /**
   * Kutuyu ASİSTAN doldurdu — zemini mor olur (`AssistantField`). İşaret buraya bağlı çünkü kutunun
   * etiket satırı zaten dolu: oraya sıkışan bir rozet taranırken atlanıyordu, üstelik kutunun kendi
   * açıklamasının yerini alıyordu.
   */
  assistant?: boolean;
}

export function FieldShell({ fieldId, label, required, labelAside, error, children, className, assistant }: FieldShellProps) {
  return (
    <AssistantField on={assistant ?? false}>
      <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
        <label htmlFor={fieldId} className="flex items-center justify-between font-ops-body text-ops-xs text-ops-body">
          <span>
            {label}
            {required ? <span className="text-ops-red-dot"> *</span> : null}
          </span>
          {labelAside ? <span className="font-ops-body text-ops-xs text-ops-faint">{labelAside}</span> : null}
        </label>
        {children}
        {error ? (
          <p id={fieldId ? `${fieldId}-error` : undefined} role="alert" className="font-ops-body text-ops-xs font-semibold text-ops-red">
            {error}
          </p>
        ) : null}
      </div>
    </AssistantField>
  );
}

/** Kontrolün `aria-describedby`'ı ile FieldShell'in hata `<p>`'si aynı id'yi paylaşır. */
export function errorIdFor(fieldId: string, error?: string): string | undefined {
  return error ? `${fieldId}-error` : undefined;
}

// `trailing`: kutunun İÇİNE bir eylem oturduğunda sağ dolgu — boyutla birlikte yaşar, çağıran
// kendi payını uydurmaz. Yazı düğmenin altına girmesin diye dolgu HER ZAMAN ayrılır (düğme gizliyken de).
// Sağ dolgu KARE eylemi taşır: kutunun iç yüksekliği kadar genişlik + kenar boşluğu.
//
// Yükseklik burada YOK, `CONTROL_H`'de: bir metin kutusu yanındaki `Select` ve altındaki düğmeyle aynı
// hizada durmalı ve o ölçü hepsinin ortak kararı (`ui/control.ts`). Burada yalnız köşe, yatay dolgu ve
// yazı kademesi var. Çok satırlı alanlar (`multiline`) o yükseklikten MUAF — bir textarea'nın boyunu
// `rows` belirler; sabit yükseklik onu tek satıra hapsederdi. Muafiyette dikey dolgu geri gelir.
const CONTROL_SIZE: Record<ControlSize, { base: string; multiline: string; trailing: string }> = {
  md: { base: 'rounded-ops-card px-[13px] text-ops-base', multiline: 'py-[7px]', trailing: 'pr-[38px]' },
  sm: { base: 'rounded-md px-2 text-ops-sm', multiline: 'py-1.5', trailing: 'pr-[32px]' },
};

/**
 * Input/textarea/select ortak görünümü (ops token'ları). `error` çerçeveyi kırmızıya çeker. TEK KAYNAK.
 *
 * ⚠ **`fullWidth` KAPATILABİLİR olmak zorunda.** Kabuk `w-full` veriyor (form alanının doğru hâli),
 * ama çağıranın `className`'ine yazdığı `w-16` onu EZEMEZ: Tailwind'de kazananı sınıf sırası değil
 * CSS kaynak sırası belirler ve iki genişlik utility'si aynı katmanda. Sonuç sessiz bir arıza —
 * yaşandı (03.08, kullanıcı ekran görüntüsü): tedarik sipariş penceresinde adet ve fiyat kutuları
 * satırı komple kaplayıp ürün adını 0 piksele düşürdü, operatör NE ısmarladığını göremedi.
 * Bir satırın içine giren kutu bunu açıkça kapatır; varsayılan değişmez.
 */
export function controlClass(
  error?: string,
  opts?: {
    size?: ControlSize;
    mono?: boolean;
    extra?: string;
    trailing?: boolean;
    multiline?: boolean;
    fullWidth?: boolean;
    /**
     * ÇIPLAK: kendi kenarlığı ve köşesi YOK — kutu bir `JoinedField`in içinde yaşıyor ve çerçeveyi
     * o çiziyor. Sınıfı `extra` ile ezmek denenemez: `border-0` ile `border` aynı utility'yi
     * yazıyor ve kazananı kaynak sırası belirliyor (`fullWidth` künyesindeki arızanın aynısı).
     */
    bare?: boolean;
  },
): string {
  const key = opts?.size ?? 'md';
  const size = CONTROL_SIZE[key];
  if (opts?.bare) {
    return [
      'min-w-0 bg-transparent text-ops-ink outline-none disabled:cursor-not-allowed disabled:opacity-60',
      opts.fullWidth === false ? undefined : 'w-full',
      key === 'sm' ? 'px-2 text-ops-sm' : 'px-[13px] text-ops-base',
      opts.multiline ? size.multiline : CONTROL_H[key],
      opts.mono ? 'font-ops-mono' : 'font-ops-body',
      opts.extra,
    ]
      .filter(Boolean)
      .join(' ');
  }
  return [
    'border bg-ops-white text-ops-ink outline-none transition-colors focus:border-ops-olive disabled:cursor-not-allowed disabled:opacity-60',
    opts?.fullWidth === false ? undefined : 'w-full',
    size.base,
    opts?.multiline ? size.multiline : CONTROL_H[key],
    // `pr-*` üretilen CSS'te `px-*`'tan sonra gelir → sağ dolguyu o kazanır (Tailwind'in kanonik sırası).
    opts?.trailing ? size.trailing : undefined,
    error ? 'border-ops-red' : 'border-ops-line-strong',
    opts?.mono ? 'font-ops-mono' : 'font-ops-body',
    opts?.extra,
  ]
    .filter(Boolean)
    .join(' ');
}
