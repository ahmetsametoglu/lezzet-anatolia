import { DECLARATION_GAP_LABELS, missingDeclarations, type DeclarationGap, type Product } from '@lezzet/types';

/**
 * Yasal beyanın beş parçasının tek harfli göstergesi — liste satırı "beyan eksik" demekle
 * yetinmez, HANGİSİNİN eksik olduğunu söyler. Eskiden bu bilgi yalnız seçili ürünün panelinde,
 * cümle içinde vardı; operatör taramak için satır satır tıklamak zorundaydı.
 *
 * Küme ve SIRA tek kaynaktan gelir (`DECLARATION_GAP_LABELS`): şemaya yeni bir beyan parçası
 * eklendiği gün gösterge kendiliğinden büyür. Harf de adın ilk harfidir — ayrı bir sözlük
 * tutulsaydı ikisi ayrışabilirdi.
 */
const GAPS = Object.keys(DECLARATION_GAP_LABELS) as DeclarationGap[];

/** `dil içeriği` → `D`. Türkçe yerele göre: `içindekiler` büyük harfte `İ` olmalı. */
const letterOf = (gap: DeclarationGap): string => DECLARATION_GAP_LABELS[gap].charAt(0).toLocaleUpperCase('tr-TR');

type DeclarationFields = Pick<Product, 'name' | 'ingredients' | 'nutrition' | 'storageInstructions' | 'allergens'>;

interface DeclarationMarksProps {
  product: DeclarationFields;
}

export function DeclarationMarks({ product }: DeclarationMarksProps) {
  // Ölçüt TEK YERDE (`missingDeclarations`): sunucunun süzgeci, sayaç ve bu gösterge aynı gerçeği okur.
  const gaps = new Set(missingDeclarations(product));
  return (
    <span className="inline-flex gap-[3px]">
      {GAPS.map((gap) => {
        const missing = gaps.has(gap);
        return (
          <span
            key={gap}
            title={`${DECLARATION_GAP_LABELS[gap]} — ${missing ? 'eksik' : 'tam'}`}
            className={[
              'grid h-[19px] w-[19px] place-items-center rounded-[4px] border font-ops-display text-ops-micro font-semibold leading-none',
              missing
                ? 'border-dashed border-ops-amber-dot bg-ops-white text-ops-amber'
                : 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark',
            ].join(' ')}
          >
            {letterOf(gap)}
          </span>
        );
      })}
    </span>
  );
}
