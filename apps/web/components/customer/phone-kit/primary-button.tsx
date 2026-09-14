/*
  BİRİNCİL DÜĞME (hap) — native kitin `PrimaryButton shape="pill"`inin (`packages/mobile-kit/src/components/ui/
  primary-button.tsx`) web telefon ikizi: içerik genişliği, 46 yükseklik (`controlSm`), hap köşe, 26 yan dolgu,
  zeytin dolgu, krem (`on-image`) etiket `button` kademesinde (14,5/700). Gölgesiz ve basılınca küçülür —
  Token Kararlari #8: gölgeli yüzey kayar, gölgesiz yüzey küçülür.

  Blok biçimi (52, sert gölge), öteki tonlar ve ikonlu hâl ilk çağıranlarıyla gelir.
*/

interface PrimaryButtonProps {
  /** Düğme etiketi — çeviri çağıranda çözülür. */
  label: string;
  onClick: () => void;
}

export function PrimaryButton({ label, onClick }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11.5 flex-none cursor-pointer items-center justify-center rounded-pill bg-olive px-6.5 font-sans text-button text-on-image transition-[scale,background-color] hover:bg-olive-dark active:scale-[0.97]"
    >
      {label}
    </button>
  );
}
