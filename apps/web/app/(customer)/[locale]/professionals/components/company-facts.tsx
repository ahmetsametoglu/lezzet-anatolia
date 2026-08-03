import type { Messages } from '../professionals-types';

/**
 * Resmî kayıttan gelen künyenin DOĞRULAMA kartı — tasarımın yeşil kutusu.
 *
 * **Salt okunur ve bu kurgunun kendisi:** aday bu satırları düzenlemez, ONAYLAR. Düzenlenebilir
 * olsaydı "resmî kayıttan getirildi" cümlesi yalan olurdu — ekranda kaydın değil, adayın yazdığı
 * bir künye dururdu ve onay kartındaki "Aktif" sinyali doğrulanmamış bir veriyi anlatırdı.
 *
 * **Faaliyet KODLA gösteriliyor** (`47.91B`) ve bu tasarımdan bir sapma: çizimde okunur bir ad var
 * ("Restoran işletmesi"). Resmî kayıt uç noktası o adı DÖNDÜRMÜYOR — yalnız kod ve tek harflik bir
 * bölüm işareti. NAF tablosunun 730 satırını koda kopyalayıp "getirildi" demek, kaydın söylemediği
 * bir şeyi kaydın ağzından söylemek olurdu. Kod okunması güç ama doğru; açık `design/BACKLOG §2`'de.
 */
interface CompanyFactsProps {
  t: Messages;
  legalName: string;
  addressLine: string;
  activityCode: string | null;
  compact: boolean;
}

export function CompanyFacts({ t, legalName, addressLine, activityCode, compact }: CompanyFactsProps) {
  const rows: Array<{ label: string; value: string }> = [
    { label: t.form.legalNameLabel, value: legalName },
    { label: t.form.addressLabel, value: addressLine },
    // Faaliyet kayıtta boş olabilir; satır YİNE ÇİZİLİR ve "belirtilmemiş" der. Satırı gizlemek
    // adayın "faaliyetim yanlış getirilmiş mi" sorusunu cevapsız bırakırdı.
    { label: t.form.activityLabel, value: activityCode ?? t.form.activityUnknown },
  ];

  return (
    <div className={`flex flex-col gap-1.5 rounded-soft bg-olive-bg ${compact ? 'px-3.5 py-3' : 'px-4.5 py-3.5'}`}>
      <span className="font-sans text-note font-bold text-olive">✓ {t.form.found}</span>
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3 font-sans text-note">
          <span className="flex-none text-muted">{row.label}</span>
          <span className="text-right font-bold text-ink">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
