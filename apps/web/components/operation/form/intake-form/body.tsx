'use client';

import { useState } from 'react';
import { Combobox } from '@/components/operation/form/combobox';
import { DateField } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MoneyInput } from '@/components/operation/form/money-input';
import { Select } from '@/components/operation/form/select';
import { money } from '@/components/operation/ui/format';
import { emptyIntakeLine, intakeTotals, type IntakeFormValues, type IntakeLine } from './schema';

/**
 * **MAL KABUL SATIRLARI** — iki yüzeyin paylaştığı tek uygulama (22.23).
 *
 * Mal kabul ekranının `FreeIntake` bloğundaydı; asistan kuyruğu aynı satırları kendi içinde açtığı
 * için ayrıldı. Kopyalansaydı bir gün biri "adet boşsa o satır kabule girmez" kuralını ya da SKT
 * zorunluluğunu yalnız bir yüzeyde düzeltirdi.
 *
 * ── FİYAT KOLONU BAYRAKLA AÇILIR — VE BU BİR ROL SINIRI ─────────────────────
 * Depocu alış fiyatını GÖRMEZ; sınır tipin kendisinde duruyor (`IntakeFormLine` fiyatsız,
 * `PurchaseIntakeLine` fiyatlı — "iki ayrı tip, iki ayrı kapı"). Bu gövde ekranın hangisi olduğunu
 * bilmez, yalnız `showCost` ile çizer: rampadaki depo ekranı kolonu hiç istemez, asistan kuyruğu
 * (patronun ekranı) ister. Kararı çağıran verir, çünkü yetkiyi bilen odur.
 *
 * ── KATALOG DIŞI ÜRÜN GİRİLMEZ ──────────────────────────────────────────────
 * Ürün arama katalogdan; tanımı olmayan ürün buradan yaratılamaz. Rampada açılan bir ürün kaydı,
 * adı/beyanı/görseli eksik bir katalog satırı bırakırdı (`FreeIntake` kararı, korunuyor).
 */
interface IntakeFormBodyProps {
  values: IntakeFormValues;
  onChange: (next: IntakeFormValues) => void;
  /** Ürün arama — SUNUCUDA; katalog forma indirilmez. */
  onSearch: (term: string) => Promise<Array<{ variantId: string; label: string }>>;
  suppliers: Array<{ id: string; name: string }>;
  /** Seçilebilecek depolar. Tek depolu kapsamda tek seçenek gelir — seçim yine açık durur. */
  warehouses: Array<{ id: string; name: string }>;
  /** Alış fiyatı kolonu çizilsin mi (yukarıdaki künye: rol sınırı). */
  showCost?: boolean;
  /**
   * Faturanın KENDİ yazdığı toplam (cent) — satır toplamıyla karşılaştırılır. `null` ise belgede
   * toplam okunamamıştır ve mutabakat satırı çizilmez; uydurulmuş bir toplam, tutmayan bir hesabı
   * tutuyor gibi gösterirdi.
   */
  documentTotalCents?: number | null;
  disabled?: boolean;
}

export function IntakeFormBody({
  values,
  onChange,
  onSearch,
  suppliers,
  warehouses,
  showCost = false,
  documentTotalCents = null,
  disabled = false,
}: IntakeFormBodyProps) {
  const [options, setOptions] = useState<Array<{ variantId: string; label: string }>>([]);
  const [searching, setSearching] = useState(false);

  const search = (term: string) => {
    if (!term.trim()) return;
    setSearching(true);
    void onSearch(term)
      .then(setOptions)
      .finally(() => setSearching(false));
  };

  const setLine = (index: number, patch: Partial<IntakeLine>) =>
    onChange({ ...values, lines: values.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  const removeLine = (index: number) => onChange({ ...values, lines: values.lines.filter((_line, i) => i !== index) });

  const { totalCents, unpricedCount } = intakeTotals(values);
  // Satır ızgarası tek yerde: başlık satırı ile kalem satırı AYNI kolonları kullanmak zorunda,
  // ikisi ayrı yazılsaydı bir kolon eklenince biri kayardı.
  const grid = showCost
    ? 'grid-cols-[1.6fr_84px_136px_96px_88px_104px_36px]'
    : 'grid-cols-[1.6fr_84px_136px_96px_88px_36px]';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5">
        {/* Depo VARSAYILANSIZ (`CLAUDE §1`): kabul deposuz yazılamaz ve "hangi depo" sorusu
            sistemin en sessiz hatasıdır — yanlış depoya giren mal, olmayan yerde satılır. */}
        <FieldShell label="Depo" required>
          <Select
            value={values.warehouseId}
            onChange={(warehouseId) => onChange({ ...values, warehouseId })}
            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            placeholder="Depo seçin"
            disabled={disabled}
          />
        </FieldShell>
        <FieldShell label="Tedarikçi">
          <Combobox
            value={values.supplierId}
            onChange={(supplierId) => onChange({ ...values, supplierId })}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Tedarikçi seçin…"
            searchPlaceholder="Tedarikçi adı"
            emptyText="Eşleşen tedarikçi yok."
            disabled={disabled}
          />
        </FieldShell>
        <FieldShell label="Belge no">
          <Input
            value={values.documentNo}
            onChange={(event) => onChange({ ...values, documentNo: event.target.value })}
            placeholder="İrsaliye / fatura no"
            disabled={disabled}
          />
        </FieldShell>
      </div>

      {/* Kabulün TARİHİ — belgenin günü, bugünün günü değil. Fatura genelde dünkü olur (akşam
          fotoğraflanır, ertesi gün onaylanır) ve yanlış güne yazılan kabul stok yaşını sessizce
          kaydırır. Boş bırakılırsa kapı bugüne yazar; alan o yüzden görünür duruyor. */}
      <DateField
        label="Belge tarihi"
        labelAside="kabul bu güne yazılır"
        value={values.date}
        onChange={(date) => onChange({ ...values, date })}
        clearable
        disabled={disabled}
        className="w-[220px]"
      />

      <div className="flex flex-col gap-2">
        <div className={`grid ${grid} items-center gap-x-2 font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-muted`}>
          <span>Kalem</span>
          <span className="text-center">Adet</span>
          <span>SKT</span>
          <span>Lot</span>
          <span>Raf</span>
          {showCost ? <span className="text-right">Birim alış</span> : null}
          <span />
        </div>

        {values.lines.map((line, index) => (
          <div key={`${line.variantId}-${index}`} className={`grid ${grid} items-center gap-x-2`}>
            <span className="truncate font-ops-body text-ops-sm text-ops-ink" title={line.title}>
              {line.title}
            </span>
            <Input
              type="number"
              min={1}
              fullWidth={false}
              className="w-full text-center"
              placeholder="adet"
              value={line.qty === null ? '' : String(line.qty)}
              onChange={(event) => setLine(index, { qty: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) })}
              disabled={disabled}
            />
            <Input
              type="date"
              fullWidth={false}
              className="w-full"
              value={line.expiryDate}
              onChange={(event) => setLine(index, { expiryDate: event.target.value })}
              disabled={disabled}
            />
            <Input
              fullWidth={false}
              className="w-full"
              placeholder="lot"
              value={line.lotNumber}
              onChange={(event) => setLine(index, { lotNumber: event.target.value })}
              disabled={disabled}
            />
            <Input
              fullWidth={false}
              className="w-full"
              placeholder="raf"
              value={line.location}
              onChange={(event) => setLine(index, { location: event.target.value })}
              disabled={disabled}
            />
            {showCost ? (
              <MoneyInput
                inputSize="sm"
                fullWidth
                ariaLabel={`${line.title} birim alış`}
                value={line.unitCost}
                onChange={(unitCost) => setLine(index, { unitCost })}
                disabled={disabled}
              />
            ) : null}
            <button
              type="button"
              onClick={() => removeLine(index)}
              disabled={disabled}
              aria-label="Satırı çıkar"
              className="cursor-pointer rounded-ops-btn border border-ops-line px-1.5 py-1 font-ops-body text-ops-micro text-ops-muted transition-colors hover:border-ops-red-line hover:text-ops-red disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ))}

        <Combobox
          value=""
          onChange={(variantId) => {
            const found = options.find((option) => option.variantId === variantId);
            if (found) onChange({ ...values, lines: [...values.lines, emptyIntakeLine(variantId, found.label)] });
          }}
          options={options.map((option) => ({ value: option.variantId, label: option.label }))}
          onSearch={search}
          loading={searching}
          placeholder="+ satır — ürün ara…"
          searchPlaceholder="Ürün adının bir parçasını yazın"
          emptyText="Eşleşen ürün yok — kabul yalnız katalogdaki ürüne yazılır."
          className="min-w-0 flex-1"
          disabled={disabled}
        />
        <span className="font-ops-body text-ops-micro text-ops-faint">
          Adedi boş bırakılan satır kabule girmez — boş satır “saymadım” demektir.
        </span>
      </div>

      {/* ── MUTABAKAT: BİZİM HESABIMIZ ↔ BELGENİN YAZDIĞI ────────────────────
          Fark bir hata değil, bir SORU: nakliye mi, iskonto mu, yoksa okunamayan bir satır mı?
          Toplamı gizleseydik fatura yanlış okunduğunda hiçbir yerde görünmezdi. */}
      {showCost ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-ops-card border border-ops-line bg-ops-surface-sunken px-3.5 py-2.5 font-ops-body text-ops-sm">
          <span className="text-ops-muted">
            Satırların toplamı <span className="font-ops-mono font-semibold text-ops-ink">{money(totalCents)}</span>
            {unpricedCount > 0 ? <span className="text-ops-amber"> · {unpricedCount} satırın fiyatı girilmedi</span> : null}
          </span>
          {documentTotalCents !== null ? (
            <span className="text-ops-muted">
              Belgede yazan <span className="font-ops-mono font-semibold text-ops-ink">{money(documentTotalCents)}</span>
              {documentTotalCents !== totalCents ? (
                <span className="font-ops-mono font-semibold text-ops-amber"> · fark {money(Math.abs(documentTotalCents - totalCents))}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-ops-faint">Belgede toplam okunamadı</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
