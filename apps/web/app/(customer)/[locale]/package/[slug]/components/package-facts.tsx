import { ALLERGEN_LABELS, resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { formatWeight } from '@/lib/storefront/format';
import type { StorefrontPackageDetail } from '@/lib/storefront/storefront-types';
import type { Messages } from '../package-types';

/**
 * K29 · Güven künyesi — ağırlık · tüketim süresi · toplu alerjen.
 *
 * Üçü de kalemlerden TÜRER (`lib/storefront/packages`), operatörden ayrıca istenmez. **Hesaplanamayan
 * satır hiç basılmaz:** bir kalemin ağırlığı girilmemişse toplam yerine yalnız kalem sayısı yazılır,
 * hiçbir kalemin raf ömrü yoksa o kutu çizilmez, alerjen listesi boşsa satır yoktur. Gıdada eksik
 * veriyi makul bir varsayılanla doldurmak ("3 gün") yanlış bir söz vermek olurdu.
 *
 * Burası ÖZETTİR, beyan değil: INCO'nun istediği tam beyan (içindekiler, besin değeri, çapraz
 * bulaşma) her kalemin kendi ürün sayfasındadır — alt not okuyucuyu oraya yollar.
 */
interface PackageFactsProps {
  t: Messages;
  locale: Locale;
  pack: StorefrontPackageDetail;
  /** Mobil: iki sütunluk ızgara yerine alt alta satırlar (dar ekranda kutu ikiye bölünmez). */
  compact?: boolean;
}

export function PackageFacts({ t, locale, pack, compact = false }: PackageFactsProps) {
  const weightValue =
    pack.totalWeightG === null
      ? t.facts.itemsOnly.replace('{n}', String(pack.itemCount))
      : t.facts.weightValue.replace('{weight}', formatWeight(pack.totalWeightG, locale)).replace('{n}', String(pack.itemCount));

  const allergens = pack.allergens.map((code) => resolveLocalizedText(ALLERGEN_LABELS[code], locale));

  if (compact) {
    return (
      <div className="flex flex-col rounded-soft border border-sand-100 bg-card">
        <FactRow label={t.facts.weight} value={weightValue} />
        {pack.shelfLifeDays !== null && (
          <FactRow label={t.facts.shelfLife} value={t.facts.shelfLifeValue.replace('{n}', String(pack.shelfLifeDays))} />
        )}
        {allergens.length > 0 && (
          <div className="flex flex-col gap-1.5 px-3.5 py-2.5">
            <span className="font-sans text-note text-muted">{t.facts.allergens}</span>
            <AllergenChips names={allergens} />
          </div>
        )}
      </div>
    );
  }

  return (
    // 1px'lik boşluk + zemin rengi = kutular arası ayraç; ayrı kenarlıklar üst üste binip
    // çift çizgi yapmasın diye (tasarımdaki ızgara böyle kurulmuş).
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-soft border border-sand-100 bg-sand-100">
      <Fact label={t.facts.weight} value={weightValue} />
      {pack.shelfLifeDays !== null && (
        <Fact label={t.facts.shelfLife} value={t.facts.shelfLifeValue.replace('{n}', String(pack.shelfLifeDays))} />
      )}
      {allergens.length > 0 && (
        <div className="col-span-full flex flex-col gap-1 bg-card px-4 py-3.5">
          <span className="font-sans text-note text-muted">{t.facts.allergens}</span>
          <AllergenChips names={allergens} />
          <span className="font-sans text-note text-muted">{t.facts.allergensNote}</span>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-4 py-3.5">
      <span className="font-sans text-note text-muted">{label}</span>
      <span className="font-sans text-body-sm font-bold text-ink">{value}</span>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-sand-100 px-3.5 py-2.5 last:border-b-0">
      <span className="font-sans text-note text-muted">{label}</span>
      <span className="font-sans text-note font-bold text-ink">{value}</span>
    </div>
  );
}

/** Alerjen çipi bal tonundadır: uyarı ama alarm değil — terracotta "hata" diye okunur (envanter). */
function AllergenChips({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className="rounded-soft border border-honey-line bg-honey-bg px-2.5 py-0.5 font-sans text-micro font-semibold whitespace-nowrap text-honey"
        >
          {name}
        </span>
      ))}
    </div>
  );
}
