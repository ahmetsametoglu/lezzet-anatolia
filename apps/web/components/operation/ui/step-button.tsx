'use client';

/**
 * Adımlayıcı düğmesi — bir sayıyı bir birim ilerleten/geriletken kare düğme ("−" / "+").
 *
 * İki kopyası vardı (`customers.mobile` puan adımlayıcısı ↔ sipariş kararı diyaloğundaki iade adedi)
 * ve DÖRT ölçüde ayrışmışlardı: 26px ↔ 24px, `rounded-ops-btn` ↔ `rounded-[6px]`, display ↔ mono
 * yazı, sönük hâlde %50 ↔ %40 saydamlık. Hiçbiri karar değildi, ikisi de aynı düğmeyi ikinci kez
 * yazmanın yan ürünüydü. Ölçü, "tasarım ölçüsü" diye künyelenmiş olandan alındı (26px).
 *
 * İşareti `−` (U+2212) yazın, kısa çizgi (`-`) değil: kısa çizgi artıya göre kısa ve yukarıda durur,
 * iki düğme yan yana hizasız okunur.
 *
 * Sayının KENDİSİ burada yok: kimi yerde salt metin, kimi yerde girdi kutusu — düğme yalnız adımı
 * bilir, gösterimi çağıran kurar.
 */
interface StepButtonProps {
  /** Görünen işaret — "−" ya da "+". */
  label: string;
  onClick: () => void;
  /** Sınıra dayanınca sönükleşir (0'ın altına inilmez, tavanın üstüne çıkılmaz). */
  disabled?: boolean;
  /** Ekran okuyucu adı — "−" tek başına ne yaptığını söylemez. */
  ariaLabel?: string;
}

export function StepButton({ label, onClick, disabled, ariaLabel }: StepButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="grid h-[26px] w-[26px] flex-none cursor-pointer place-items-center rounded-ops-btn border border-ops-line-strong font-ops-display text-ops-sm font-semibold text-ops-strong outline-none transition-colors hover:border-ops-olive hover:text-ops-olive disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
