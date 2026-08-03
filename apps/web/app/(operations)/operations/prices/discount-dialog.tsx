'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fromCents, toCents } from '@lezzet/helper';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { MoneyField, PercentField } from '@/components/operation/form/money-input';
import { DateRangeField } from '@/components/operation/form/date-field';
import { parseDay, toDay } from '@/components/operation/form/calendar-math';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { LocalizedTextField } from '@/components/operation/form/localized-text-field';
import { Select } from '@/components/operation/form/select';
import { Toggle } from '@/components/operation/form/toggle';
import { suggestTranslationAction } from '@/lib/ai/translate';
import { saveDiscountAction } from './actions';
import { LOCALES, type Locale } from '@lezzet/i18n';
import type { DiscountScope, DiscountTrigger, DiscountType, LocalizedText } from '@lezzet/types';
import type { CategoryOption, DiscountRow } from './prices-types';

// İndirim / kupon formu — kupon ve kampanya AYNI form. Ayrımları tek anahtarda (tetik) ve o anahtar
// formun en üstünde: seçim, altındaki alanların anlamını değiştirir (kod alanı yalnız kuponda var).
//
// DEĞER TEK KUTU, iki taban: yüzde mi sabit tutar mı olduğunu tip anahtarı söyler. İki ayrı kutu
// koymak "hangisini doldurayım" sorusunu doğururdu; boş kalan kutu da bir yanlış anlama kaynağıdır.
//
// KOŞULLAR opsiyoneldir ve boş bırakılan koşul YOKTUR — 0 ile karıştırılmamalı. Bu yüzden alanlar
// sıfırla değil BOŞ başlar ve yer tutucular "sınırsız" der.
//
// Kaydetmenin son emniyeti DB kısıtlarıdır (0031): kodsuz kupon, hedefsiz kapsam, ters tarih ve
// tekrarlanan kod veritabanında reddedilir. Form aynı kuralı gösterir ama gerçeğin sahibi tektir.

/**
 * Müşteriye görünen adın uzunluk tavanı. Kural teknik değil YERLEŞİMDEN geliyor: metin sepet ve mail
 * özetinde para satırının etiketi olarak duruyor ("İndirim — …  −3,00 €"). Uzun bir cümle o satırı
 * iki satıra kırar ve kartı okunmaz hâle getirir. Tavan bu yüzden formda, kaydederken değil:
 * operatör yazarken görsün, sonradan kesilmiş bir metinle karşılaşmasın.
 */
const PUBLIC_LABEL_MAX = 40;

const PUBLIC_LABEL_PLACEHOLDER: Record<Locale, string> = {
  tr: 'ör. Hoş geldin indirimi',
  fr: 'ör. Offre de bienvenue',
  de: 'ör. Willkommensrabatt',
};

/** Kod örnekleri de DİLE göre: müşteri kendi dilinde okuyabildiği bir şey yazacak. */
const CODE_PLACEHOLDER: Record<Locale, string> = {
  tr: 'ör. HOSGELDIN',
  fr: 'ör. BIENVENUE',
  de: 'ör. WILLKOMMEN',
};

interface DiscountDialogProps {
  /** Dolu → düzenleme; boş → yeni kural. */
  editing: DiscountRow | null;
  categories: CategoryOption[];
  collections: CategoryOption[];
  onClose: () => void;
}

export function DiscountDialog({ editing, categories, collections, onClose }: DiscountDialogProps) {
  const router = useRouter();
  const isEdit = editing !== null;

  const [name, setName] = useState(editing?.name ?? '');
  const [publicLabel, setPublicLabel] = useState<LocalizedText>(editing?.publicLabel ?? {});
  const [trigger, setTrigger] = useState<DiscountTrigger>(editing?.trigger ?? 'coupon');
  // Kodlar DİL BAŞINA: kayıttaki satırlar forma dile göre dağılır. Dili olmayan bir kod (matbu kart)
  // TR kutusuna düşer — formun üç kutusu var ve kod bir yerde görünmek zorunda.
  const [codes, setCodes] = useState<Partial<Record<Locale, string>>>(() => codeMapOf(editing));
  const [type, setType] = useState<DiscountType>(editing?.type ?? 'percent');
  // Tek GİRDİ KUTUSU var (tipe göre yüzde ya da para kipinde) ve kutu ekran birimiyle çalışır:
  // yüzdede oran, sabit tutarda EURO. Gönderilen alanlar ayrıktır (`percent` / `amountCents`).
  const [value, setValue] = useState<number | null>(
    editing === null ? null : editing.type === 'fixed' ? fromCents(editing.amountCents ?? 0) : editing.percent,
  );
  const [scope, setScope] = useState<DiscountScope>(editing?.scope ?? 'cart');
  const [targetId, setTargetId] = useState<string>('');
  const [minBasket, setMinBasket] = useState<number | null>(
    editing?.minBasketCents == null ? null : fromCents(editing.minBasketCents),
  );
  const [firstOrderOnly, setFirstOrderOnly] = useState(editing?.firstOrderOnly ?? false);
  const [validFrom, setValidFrom] = useState(toDayValue(editing?.validFrom ?? null));
  const [validTo, setValidTo] = useState(toDayValue(editing?.validTo ?? null));
  const [maxUses, setMaxUses] = useState<string>(editing?.maxUses?.toString() ?? '');
  const [perCustomerLimit, setPerCustomerLimit] = useState<string>(editing?.perCustomerLimit?.toString() ?? '');
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targets = scope === 'category' ? categories : scope === 'collection' ? collections : [];

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error: actionError } = await saveDiscountAction({
      id: editing?.id ?? null,
      name,
      publicLabel,
      trigger,
      codes,
      type,
      percent: type === 'percent' ? value : null,
      amountCents: type === 'fixed' && value !== null ? toCents(value) : null,
      scope,
      targetId: scope === 'cart' ? null : targetId || null,
      minBasketCents: minBasket === null ? null : toCents(minBasket),
      firstOrderOnly,
      validFrom: validFrom ? new Date(validFrom).toISOString() : null,
      // Bitiş GÜNÜN SONU: "31 Tem'e kadar" yazan operatör 31 Temmuz akşamını kasteder, sabahını değil.
      validTo: validTo ? new Date(`${validTo}T23:59:59`).toISOString() : null,
      // Kişisel kupon bu formdan AÇILMAZ: sahibi puan kullanımıdır (modül 16). Elle açılması
      // gerektiğinde müşteri ekranından bağlanacak — burada sessizce `null`.
      customerId: null,
      maxUses: maxUses.trim() ? Number(maxUses) : null,
      perCustomerLimit: perCustomerLimit.trim() ? Number(perCustomerLimit) : null,
      isActive,
    });
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  };

  // Kuponun EN AZ BİR kapısı olmalı; hangi dilde olduğu operatörün kararı (matbu tek kod meşrudur).
  const codeCount = LOCALES.filter((l) => (codes[l] ?? '').trim()).length;

  /**
   * O dildeki kapının kaç kez kullanıldığı — kotanın kırılımı, kendisi değil.
   *
   * Kod DEĞİŞTİRİLİRSE sayı düşer ve bu doğru: yeni kod yeni bir kapıdır, eskisinin geçmişini
   * devralmaz. Etiketin sayı göstermesi kararı besliyor — hiç kullanılmamış bir kodu değiştirmek
   * bedelsizdir, yüz kez kullanılmış olanı değiştirmek dolaşımdaki kodu kapatır.
   */
  const usedCountOf = (lang: Locale): number => {
    const typed = (codes[lang] ?? '').trim().toUpperCase();
    if (!typed) return 0;
    return editing?.codes.find((c) => c.code.toUpperCase() === typed)?.usedCount ?? 0;
  };

  const blocked = !name.trim()
    ? 'Ad girilmeli'
    : trigger === 'coupon' && codeCount === 0
      ? 'En az bir dilde kupon kodu girilmeli'
      : value === null || value <= 0
        ? 'İndirim değeri girilmeli'
        : // Tavan DB kısıtında da var (%100 üstü yüzde yasak) ama oradan dönen mesaj ham Postgres
          // metnidir. Kural ekranda da söylenir — operatör kısıt ihlali okumaz.
          type === 'percent' && value > 100
          ? 'Yüzde 100ün üstünde olamaz'
          : maxUses !== '' && Number(maxUses) === 0
            ? 'Kullanım tavanı 0 olamaz — kupon hiç kullanılamaz'
            : perCustomerLimit !== '' && Number(perCustomerLimit) === 0
              ? 'Müşteri başı sınır 0 olamaz — kupon hiç kullanılamaz'
              : scope !== 'cart' && !targetId
                ? 'Kapsam hedefi seçilmeli'
                : null;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={560}
      title={isEdit ? 'İndirimi düzenle' : 'Yeni indirim / kupon'}
      subtitle={trigger === 'coupon' ? 'Müşteri kodu yazarak kullanır' : 'Koşullar tutunca kendiliğinden uygulanır'}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs text-ops-muted">
            {error ? <span className="font-semibold text-ops-red">{error}</span> : 'Tek-en-büyük: indirimler üst üste binmez'}
          </span>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || blocked !== null} title={blocked ?? undefined}>
            {busy ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Oluştur'}
          </Button>
        </>
      }
    >
      <FieldShell label="Tetik">
        <MultiToggle
          value={trigger}
          onChange={setTrigger}
          label="Tetik"
          options={[
            { key: 'coupon', label: 'Kupon (kodlu)' },
            { key: 'automatic', label: 'Otomatik kampanya' },
          ]}
        />
      </FieldShell>

      <FieldShell label="Ad" labelAside="Yalnız sizin listeniz için — müşteri görmez">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ör. Bayram indirimi" />
      </FieldShell>

      {/* MÜŞTERİ METNİ TEK KARTTA, dil kartın SEKMESİNDEN gelir (ürün formunun deseni). İki alan da
          aynı dile bağlı: Fransız müşteri "Offre de bienvenue" adını görür ve "BIENVENUE" kodunu
          yazar. Ayrı kutulara bölünseydi hangi kodun hangi adla gittiği ekranda hiç görünmezdi.

          Kart, tek alanlı bir değer için kurulmazdı — burada iki alan var ve ikisi tek dil bağlamını
          paylaşıyor, kartın var olma sebebi tam bu.

          KOD DİLE BAĞLIDIR ve bu keyfi değil: "HOSGELDIN" Türk müşteriye bir şey anlatır, Fransız'a
          hiçbir şey. Üç kod TEK kuponun kapılarıdır — koşulları, değeri ve **kullanım tavanı ortaktır**.
          Ayrı kupon açmak "toplam 100 kullanım" sınırını sessizce 300 yapardı. */}
      <LocaleCard title="Müşteriye görünen" completenessOf={publicLabel}>
        {(lang) => (
          <>
            <LocalizedTextField
              value={publicLabel}
              onChange={setPublicLabel}
              lang={lang}
              label="Ad"
              placeholder={(l) => `${PUBLIC_LABEL_PLACEHOLDER[l]}…`}
              maxLength={PUBLIC_LABEL_MAX}
              onAiTranslate={suggestTranslationAction}
              hint="Sepette ve mailde indirim satırının yanına yazılır (“İndirim — Hoş geldin indirimi”) — kısa tutun. Boş bırakılırsa müşteri yalnız “İndirim” görür."
            />

            {trigger === 'coupon' ? (
              <FieldShell
                label="Kupon kodu"
                labelAside={usedCountOf(lang) > 0 ? `${usedCountOf(lang)} kez kullanıldı` : 'boş = bu dilde kod yok'}
              >
                {/* Kod HER ZAMAN büyük harfe çevrilir: müşteri "bayram10" yazsa da aynı kupon bulunur
                    (arama harf ayrımsız), ama listede tek bir yazım görünsün. */}
                <Input
                  value={codes[lang] ?? ''}
                  mono
                  onChange={(e) => setCodes({ ...codes, [lang]: e.target.value.toUpperCase() })}
                  placeholder={CODE_PLACEHOLDER[lang]}
                />
                <span className="font-ops-body text-ops-micro leading-[1.6] text-ops-faint">
                  Bu dildeki kapı. Hepsi AYNI kuponu açar ve aynı kullanım tavanını paylaşır — kaç kez
                  hangi kodla girildiği ayrı sayılır.
                </span>
              </FieldShell>
            ) : null}
          </>
        )}
      </LocaleCard>

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="İndirim tipi">
          <MultiToggle
            value={type}
            onChange={setType}
            label="İndirim tipi"
            options={[
              { key: 'percent', label: 'Yüzde' },
              { key: 'fixed', label: 'Sabit tutar' },
            ]}
          />
        </FieldShell>
        {type === 'percent' ? (
          <PercentField label="Değer (%)" labelAside="zorunlu" id="discount-value" value={value} onChange={setValue} placeholder="ör. 10" />
        ) : (
          <MoneyField label="Değer (€)" required id="discount-value" value={value} onChange={setValue} placeholder="ör. 5,00" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Kapsam" labelAside="Kupon daima sepet kapsamındadır">
          <Select
            value={scope}
            onChange={(next) => {
              setScope(next as DiscountScope);
              setTargetId('');
            }}
            options={[
              { value: 'cart', label: 'Sepet (tümü)' },
              { value: 'category', label: 'Kategori' },
              { value: 'collection', label: 'Koleksiyon' },
            ]}
          />
        </FieldShell>
        {scope !== 'cart' ? (
          <FieldShell label={scope === 'category' ? 'Kategori' : 'Koleksiyon'}>
            <Select
              value={targetId}
              onChange={setTargetId}
              placeholder="Seç"
              options={targets.map((t) => ({ value: t.id, label: t.name }))}
            />
          </FieldShell>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MoneyField
          label="Asgari sepet (€)"
          labelAside="boş = koşul yok"
          id="discount-min-basket"
          value={minBasket}
          onChange={setMinBasket}
          placeholder="ör. 50,00"
        />
        <FieldShell label="Yalnız ilk sipariş">
          <div className="flex items-center gap-2.5 rounded-ops-card border border-ops-line px-3 py-2">
            <Toggle on={firstOrderOnly} onChange={setFirstOrderOnly} label="Yalnız ilk sipariş" />
            <span className="font-ops-body text-ops-xs text-ops-muted">
              {firstOrderOnly ? 'Yalnız ilk siparişte geçerli' : 'Her siparişte geçerli'}
            </span>
          </div>
        </FieldShell>
      </div>

      {/* Geçerlilik TEK alan: başlangıç ve bitiş ayrı kutularda dururken ikisi arasındaki ilişki
          (ters aralık) ancak kaydederken görülüyordu. Aralık seçicide ters seçim zaten kurulamaz. */}
      <DateRangeField
        label="Geçerlilik"
        labelAside="boş = hemen başlar, süresiz"
        from={validFrom}
        to={validTo}
        onChange={(nextFrom, nextTo) => {
          setValidFrom(nextFrom);
          setValidTo(nextTo);
        }}
        placeholder="Süresiz"
      />

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Toplam kullanım sınırı" labelAside="boş = sınırsız">
          <Input value={maxUses} mono inputMode="numeric" onChange={(e) => setMaxUses(digits(e.target.value))} placeholder="ör. 100" />
        </FieldShell>
        <FieldShell label="Müşteri başına sınır" labelAside="boş = sınırsız">
          <Input
            value={perCustomerLimit}
            mono
            inputMode="numeric"
            onChange={(e) => setPerCustomerLimit(digits(e.target.value))}
            placeholder="ör. 1"
          />
        </FieldShell>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-ops-card border border-ops-line px-3.5 py-2.5">
        <div className="flex flex-col gap-px">
          <span className="font-ops-body text-ops-sm font-medium text-ops-ink">Aktif</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            Kapalı kural hiç uygulanmaz ama listede kalır — geçmişi silinmez
          </span>
        </div>
        <Toggle on={isActive} onChange={setIsActive} label="Aktif" />
      </div>

      <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
        Tek-en-büyük kuralı: birden çok indirim uygun olsa bile müşteriye yalnız en büyüğü uygulanır — müşterinin
        genel indirim oranı da aynı havuzda yarışır. Paketlere ve yaklaşan tarihli teklife hiçbir genel indirim
        binmez; o kalemler kendi özel fiyatındadır.
      </span>
    </Dialog>
  );
}

/**
 * Kayıttaki kod satırlarını formun dil kutularına dağıtır.
 *
 * **Dili olmayan kod TR kutusuna düşer** (`locale = null` — matbu bir kart üstündeki tek kod gibi):
 * formun üç kutusu var ve kod bir yerde görünmek zorunda; görünmezse operatör onu silmediği hâlde
 * kaydetme sırasında kaybederdi. Aynı dilde ikinci bir kod varsa yalnız ilki forma gelir — form dil
 * başına bir kapı kuruyor, tablo bunu şart koşmuyor.
 */
function codeMapOf(editing: DiscountRow | null): Partial<Record<Locale, string>> {
  const map: Partial<Record<Locale, string>> = {};
  for (const row of editing?.codes ?? []) {
    const lang = row.locale ?? 'tr';
    map[lang] ??= row.code;
  }
  return map;
}

/**
 * DB'deki ISO damgadan takvim GÜNÜNÜ alır. Ayrıştırma tek yerde (`calendar-math`): burada ikinci
 * bir dönüşüm yazmak, kaydedilen gün ile gösterilen günü ayrı dilimlerde farklı gösterebilirdi.
 */
function toDayValue(iso: string | null): string {
  const date = parseDay(iso);
  return date ? toDay(date) : '';
}

/** Sayı alanına yalnız rakam: "3 adet" gibi bir metin sessizce NaN'a dönerdi. */
function digits(raw: string): string {
  return raw.replace(/\D/g, '');
}
