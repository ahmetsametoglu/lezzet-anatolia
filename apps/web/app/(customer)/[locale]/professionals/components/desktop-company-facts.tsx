import { Icon } from '@/components/customer/ui/icons';
import type { Messages } from '../professionals-types';

/**
 * Resmî kayıttan gelen künyenin doğrulama kartı, salt okunur: düzenlenebilseydi "resmî kayıttan getirildi" cümlesi yalan olurdu. Faaliyet
 * kodla gösterilir, çünkü kayıt ucu okunur adı döndürmüyor (açık iş `design/BACKLOG §2`).
 */
interface DesktopCompanyFactsProps {
  t: Messages;
  legalName: string;
  addressLine: string;
  activityCode: string | null;
}

export function DesktopCompanyFacts({ t, legalName, addressLine, activityCode }: DesktopCompanyFactsProps) {
  const rows: Array<{ label: string; value: string }> = [
    { label: t.form.legalNameLabel, value: legalName },
    { label: t.form.addressLabel, value: addressLine },
    // Faaliyet boşsa satır yine çizilir: gizlemek "faaliyetim yanlış mı getirildi" sorusunu cevapsız bırakırdı.
    { label: t.form.activityLabel, value: activityCode ?? t.form.activityUnknown },
  ];

  return (
    <div className="flex flex-col gap-1.5 rounded-soft bg-olive-bg px-4.5 py-3.5">
      <span className="inline-flex items-center gap-1.5 font-sans text-note font-bold text-olive">
        <Icon name="check" size={14} />
        {t.form.found}
      </span>
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3 font-sans text-note">
          <span className="flex-none text-muted">{row.label}</span>
          <span className="text-right font-bold text-ink">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
