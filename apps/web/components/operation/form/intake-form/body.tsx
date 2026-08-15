'use client';

import { useState } from 'react';
import { Combobox } from '@/components/operation/form/combobox';
import { DateField, DateInput } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MoneyInput } from '@/components/operation/form/money-input';
import { Select } from '@/components/operation/form/select';
import { Toggle } from '@/components/operation/form/toggle';
import { money, num } from '@/components/operation/ui/format';
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
  /**
   * Yeni tedarikçiyi HIZLI ekleme kapısı — verilmezse alan yalnız seçim yapar. `null` dönerse kayıt
   * yazılamadı demektir ve satır açık kalır (hata çağıranın kapısında görünür).
   */
  onCreateSupplier?: (name: string, phone: string | null) => Promise<{ id: string; name: string } | null>;
  disabled?: boolean;
}

/** Etiketin yanındaki "+ yeni / vazgeç" bağlantısı — alanı seçiciden hızlı ekleme satırına çevirir. */
function QuickAddToggle({ open, onToggle }: { open: boolean; onToggle: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!open)}
      className="cursor-pointer font-ops-body text-ops-micro font-semibold text-ops-olive-dark hover:underline"
    >
      {open ? 'listeden seç' : '+ yeni'}
    </button>
  );
}

/**
 * Yeni tedarikçi satırı — **ad zorunlu, telefon isteğe bağlı.**
 *
 * Telefon `contact` bloğuna yazılıyor (tedarikçide ayrı bir `phone` kolonu yok ve açılmıyor: iletişim
 * bilgisi zaten orada yaşıyor, ikinci bir yer iki gerçek demek olurdu).
 */
function QuickSupplier({
  disabled,
  onCancel,
  onCreate,
}: {
  disabled: boolean;
  onCancel: () => void;
  onCreate: (name: string, phone: string | null) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const save = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    void onCreate(name.trim(), phone.trim() || null).finally(() => setBusy(false));
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        inputSize="sm"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Tedarikçi adı"
        disabled={disabled || busy}
      />
      <Input
        inputSize="sm"
        fullWidth={false}
        className="w-[120px]"
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="telefon"
        disabled={disabled || busy}
      />
      <button
        type="button"
        onClick={save}
        disabled={disabled || busy || !name.trim()}
        className="flex-none cursor-pointer rounded-ops-btn border border-ops-olive-line bg-ops-olive-bg px-2 py-1 font-ops-body text-ops-micro font-semibold text-ops-olive-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? '…' : 'Ekle'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Yeni tedarikçiden vazgeç"
        className="flex-none cursor-pointer rounded-ops-btn border border-ops-line px-1.5 py-1 font-ops-body text-ops-micro text-ops-muted hover:border-ops-red-line hover:text-ops-red"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Kolon şablonları — kalem · [beklenen] · adet · SKT · lot · raf · [birim alış] · [gelmedi] · sil.
 * Köşeli parantezliler kipe göre var/yok; dördü de literal (yukarıdaki künye: Tailwind tarama).
 */
const GRID = {
  ordered: {
    cost: 'grid-cols-[1.6fr_72px_84px_132px_96px_88px_104px_84px_36px]',
    plain: 'grid-cols-[1.6fr_72px_84px_132px_96px_88px_84px_36px]',
  },
  free: {
    cost: 'grid-cols-[1.6fr_84px_132px_96px_88px_104px_36px]',
    plain: 'grid-cols-[1.6fr_84px_132px_96px_88px_36px]',
  },
} as const;

export function IntakeFormBody({
  values,
  onChange,
  onSearch,
  suppliers,
  warehouses,
  showCost = false,
  documentTotalCents = null,
  onCreateSupplier,
  disabled = false,
}: IntakeFormBodyProps) {
  const [options, setOptions] = useState<Array<{ variantId: string; label: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);

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
  /**
   * **Siparişli kabul mü, serbest kabul mü** — satırın kendisinden okunur (22.26).
   *
   * Ayrı bir `mode` prop'u koymadım: kip zaten veride duruyor (`expectedQty` dolu ⇒ ısmarlanmış bir
   * kalem). İkinci bir bayrak, veriyle çelişebilecek ikinci bir gerçek olurdu.
   */
  const ordered = values.lines.some((line) => line.expectedQty !== null);
  // Satır ızgarası tek yerde: başlık satırı ile kalem satırı AYNI kolonları kullanmak zorunda,
  // ikisi ayrı yazılsaydı bir kolon eklenince biri kayardı.
  //
  // Dört hâl AÇIKÇA yazılı, parça parça birleştirilmiyor: Tailwind sınıfları kaynak metinden tarıyor
  // — çalışma anında kurulan bir `grid-cols-[…]` üretilmez ve ızgara sessizce çöker.
  const grid = GRID[ordered ? 'ordered' : 'free'][showCost ? 'cost' : 'plain'];

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
        {/* **Yeni tedarikçi HIZLI eklenir** — tasarımın kuralı: *"ad + telefon yeter; vergi no, vade,
            adres admin işi"*. Kamyon rampada beklerken ayrı bir sayfaya gitmek akışı kırar; eksik
            alanlar sonradan Tedarik ekranından tamamlanır. Kabulü tedarikçi formuna rehin vermiyoruz. */}
        <FieldShell label="Tedarikçi" labelAside={onCreateSupplier ? <QuickAddToggle open={adding} onToggle={setAdding} /> : undefined}>
          {adding && onCreateSupplier ? (
            <QuickSupplier
              disabled={disabled}
              onCancel={() => setAdding(false)}
              onCreate={async (name, phone) => {
                const created = await onCreateSupplier(name, phone);
                if (!created) return false;
                onChange({ ...values, supplierId: created.id });
                setAdding(false);
                return true;
              }}
            />
          ) : (
            <Combobox
              value={values.supplierId}
              onChange={(supplierId) => onChange({ ...values, supplierId })}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Tedarikçi seçin…"
              searchPlaceholder="Tedarikçi adı"
              emptyText="Eşleşen tedarikçi yok."
              disabled={disabled}
            />
          )}
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
          {ordered ? <span className="text-center">Sipariş</span> : null}
          <span className="text-center">Gelen</span>
          <span>SKT</span>
          <span>Lot</span>
          <span>Raf</span>
          {showCost ? <span className="text-right">Birim alış</span> : null}
          {ordered ? <span className="text-center">Gelmedi</span> : null}
          <span />
        </div>

        {values.lines.map((line, index) => (
          <div key={`${line.variantId}-${index}`} className={`grid ${grid} items-center gap-x-2`}>
            <span className="truncate font-ops-body text-ops-sm text-ops-ink" title={line.title}>
              {line.title}
            </span>
            {/* Ismarlanan adet OKUNUR, yazılmaz: sipariş bizim kaydımız, kabul ise sayımdır. */}
            {ordered ? (
              <span className="text-center font-ops-mono text-ops-sm text-ops-muted">
                {line.expectedQty === null ? '—' : num(line.expectedQty)}
              </span>
            ) : null}
            <Input
              type="number"
              min={1}
              inputSize="sm"
              fullWidth={false}
              className="w-full text-center"
              placeholder="adet"
              value={line.qty === null ? '' : String(line.qty)}
              onChange={(event) => setLine(index, { qty: event.target.value === '' ? null : Math.max(0, Number(event.target.value) || 0) })}
              disabled={disabled || line.isMissing}
            />
            {/* SKT ORTAK TAKVİMDEN: ham `<input type="date">` yasak — tarayıcının takvimi her
                platformda başka görünür ve dili tarayıcının dilidir (`date-field` künyesi). */}
            <DateInput
              size="sm"
              ariaLabel={`${line.title} son kullanma tarihi`}
              value={line.expiryDate}
              onChange={(expiryDate) => setLine(index, { expiryDate })}
              placeholder="SKT"
              disabled={disabled || line.isMissing}
            />
            <Input
              inputSize="sm"
              fullWidth={false}
              className="w-full"
              placeholder="lot"
              value={line.lotNumber}
              onChange={(event) => setLine(index, { lotNumber: event.target.value })}
              disabled={disabled || line.isMissing}
            />
            <Input
              inputSize="sm"
              fullWidth={false}
              className="w-full"
              placeholder="raf"
              value={line.location}
              onChange={(event) => setLine(index, { location: event.target.value })}
              disabled={disabled || line.isMissing}
            />
            {showCost ? (
              <MoneyInput
                inputSize="sm"
                fullWidth
                ariaLabel={`${line.title} birim alış`}
                value={line.unitCost}
                onChange={(unitCost) => setLine(index, { unitCost })}
                disabled={disabled || line.isMissing}
              />
            ) : null}
            {/* **"Gelmedi" bir BEYANDIR, boş satır değil.** Boş satır "henüz saymadım" demektir;
                ikisi karışırsa yarım kabul tam sanılır. İşaretlenen satırın hücreleri kapanır:
                gelmemiş malın son kullanma tarihi olmaz. */}
            {ordered ? (
              <div className="flex justify-center">
                {/* Kilitli hâlde `onChange` VERİLMİYOR: `Toggle` onsuz salt-gösterge oluyor
                    (kendi künyesi) — ayrı bir `disabled` prop'una gerek kalmıyor. */}
                <Toggle
                  size="sm"
                  on={line.isMissing}
                  label={`${line.title} gelmedi`}
                  onChange={
                    disabled ? undefined : (isMissing) => setLine(index, isMissing ? { isMissing, qty: null } : { isMissing })
                  }
                />
              </div>
            ) : null}
            {/* Siparişli kabulde satır SİLİNMEZ: kalemler siparişin kendisinden geliyor ve listeden
                çıkarmak, ısmarlanmış bir malı sessizce yok saymak olurdu — karşılığı "gelmedi". */}
            {ordered ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={() => removeLine(index)}
                disabled={disabled}
                aria-label="Satırı çıkar"
                className="cursor-pointer rounded-ops-btn border border-ops-line px-1.5 py-1 font-ops-body text-ops-micro text-ops-muted transition-colors hover:border-ops-red-line hover:text-ops-red disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {/* Satır EKLEME yalnız serbest kabulde: siparişli kabulde kalemler siparişin kendisinden
            gelir ve ısmarlanmamış bir malı o siparişe yazmak, farkı yalanlamak olurdu. */}
        {ordered ? null : (
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
        )}
        <span className="font-ops-body text-ops-micro text-ops-faint">
          Adedi boş bırakılan satır kabule girmez — boş satır “saymadım” demektir
          {ordered ? '; gelmediğini biliyorsanız satırı “gelmedi” işaretleyin.' : '.'}
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
