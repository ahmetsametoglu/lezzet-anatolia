'use client';

import { useState } from 'react';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { ToggleField } from '@/components/operation/form/toggle';
import { CustomerTypeEnum, PreferredLanguageEnum, type Country, type CustomerType, type PreferredLanguage } from '@lezzet/types';
import { COUNTRY_OPTIONS } from '@/components/operation/ui/labels';
import { TYPE_LABEL } from '../customers-url';
import type { CustomerEditInput, CustomerRow } from '../customers-types';

/**
 * Müşteri bilgisi düzenleme (tasarım: "Düzenle").
 *
 * **KİMLİK + İLETİŞİM + iki TİCARİ AYAR** (kapıda ödeme izni, genel indirim oranı). O iki ayar bir tur
 * önizleme panelinde canlı kontrol olarak duruyordu; buraya taşındı (kullanıcı kararı 30.07): tasarımda
 * panel onları salt görünüm gösteriyor ve panelde onaylanacak bir form olmadığı için tıklama anında
 * yazılıyordu — geri alınamayan, hiç "Kaydet" görmeyen bir yazma. İkisi de müşteriye dair bir NİYETTİR,
 * yani kimlik bilgisiyle aynı raf; tek formda tek kaydetmeyle giderler.
 *
 * Vade/limit AYRI diyalogda kalır çünkü ayrı karar: karneye bakarak verilir ve üç alanı (yetki, limit,
 * süre) birbirinden ayrılamaz. Türetilmiş değerler (açık bakiye, puan, ciro) hiç düzenlenmez — kaynağı
 * düzeltilir (tasarım §6). Pazarlama izni de yok: izin müşterinin kendi eylemiyle doğar, admin elle
 * izin üretemez (aksi GDPR kanıtını bozar).
 *
 * Telefon ve e-posta KİMLİK anahtarlarıdır ve tekildir. Çakışma kontrolü BURADA YAPILMAZ: kural DB
 * kısıtındadır ve action onu okunur bir hataya çevirir — iki yerde yazılan bir tekillik ölçütü, bir
 * gün ayrışan iki ölçüt demektir.
 */
const FORM_ID = 'customer-edit-form';

const LANGUAGE_LABEL: Record<PreferredLanguage, string> = { tr: 'Türkçe', fr: 'Français', de: 'Deutsch' };

interface CustomerEditDialogProps {
  row: CustomerRow;
  /** Profilden gelen, satırda taşınmayan alan. */
  vatNumber: string | null;
  preferredLanguage: PreferredLanguage;
  /** Kapıda ödeme izni — detaydan gelir (satırda taşınmıyor). */
  codAllowed: boolean;
  /** Genel indirim oranı (%); `null` = oran yok. */
  discountPercent: number | null;
  /** Fiyat grubu üyeliği; `null` = grupsuz. */
  priceGroupId: string | null;
  /** Grup seçenekleri — gruplar Fiyatlar ekranında yönetilir, burada yalnız ATANIR. */
  priceGroupOptions: { id: string; name: string; percentOff: number }[];
  saving: boolean;
  error: string | null;
  onSave: (input: CustomerEditInput) => void;
  onClose: () => void;
}

export function CustomerEditDialog({
  row,
  vatNumber,
  preferredLanguage,
  codAllowed,
  discountPercent,
  priceGroupId,
  priceGroupOptions,
  saving,
  error,
  onSave,
  onClose,
}: CustomerEditDialogProps) {
  const [name, setName] = useState(row.name);
  const [phone, setPhone] = useState(row.phone ?? '');
  const [email, setEmail] = useState(row.email ?? '');
  const [lang, setLang] = useState<PreferredLanguage>(preferredLanguage);
  const [country, setCountry] = useState<Country>(row.country);
  const [type, setType] = useState<CustomerType>(row.type);
  const [vat, setVat] = useState(vatNumber ?? '');
  const [cod, setCod] = useState(codAllowed);
  // Oran METİN tutulur: boş kutu ile sıfır AYRI hâller ve `number` state boşluğu temsil edemez
  // (vade süresi alanıyla aynı gerekçe).
  const [discount, setDiscount] = useState(discountPercent === null ? '' : String(discountPercent));
  // Grup boşluğu '' ile temsil edilir (Select string ister); kaydederken null'a döner.
  const [group, setGroup] = useState(priceGroupId ?? '');

  const adBos = name.trim() === '';
  // Her iki kimlik anahtarı da boşsa kayıt bir daha BULUNAMAZ: ne telefonla ne e-postayla. Ad tek
  // başına kimlik değil (iki "Ahmet Yılmaz" olabilir).
  const kimliksiz = phone.trim() === '' && email.trim() === '';
  const oran = discount.trim() === '' ? null : Number(discount.replace(',', '.'));
  const oranGecersiz = oran !== null && (!Number.isFinite(oran) || oran < 0 || oran > 100);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Müşteri bilgisi"
      subtitle={row.name}
      maxWidth={560}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={saving}
          error={error}
          blockedReason={
            adBos
              ? 'Ad girilmeli.'
              : kimliksiz
                ? 'Telefon veya e-posta girilmeli.'
                : oranGecersiz
                  ? 'İndirim oranı %0 ile %100 arasında olmalı.'
                  : null
          }
        />
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            name,
            phone: phone.trim() || null,
            email: email.trim() || null,
            preferredLanguage: lang,
            country,
            type,
            vatNumber: vat.trim() || null,
            codAllowed: cod,
            discountPercent: oran,
            priceGroupId: group || null,
          });
        }}
        className="flex flex-col gap-3.5"
      >
        <FieldShell label="Ad" required error={adBos ? 'Ad girilmeli.' : undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
        </FieldShell>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell
            label="Telefon"
            labelAside={<span className="font-ops-body text-ops-xs text-ops-muted">kimlik anahtarı</span>}
          >
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} mono inputMode="tel" placeholder="+33…" disabled={saving} />
          </FieldShell>
          <FieldShell label="E-posta">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" disabled={saving} />
          </FieldShell>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FieldShell label="Tip">
            <Select
              value={type}
              onChange={(v) => setType(v as CustomerType)}
              options={CustomerTypeEnum.options.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
            />
          </FieldShell>
          <FieldShell
            label="Dil"
            labelAside={<span className="font-ops-body text-ops-xs text-ops-muted">mail dili</span>}
          >
            <Select
              value={lang}
              onChange={(v) => setLang(v as PreferredLanguage)}
              options={PreferredLanguageEnum.options.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))}
            />
          </FieldShell>
          <FieldShell label="Ülke">
            <Select
              value={country}
              onChange={(v) => setCountry(v as Country)}
              options={COUNTRY_OPTIONS}
            />
          </FieldShell>
        </div>

        {/* Vergi numarası YALNIZ şirkette: bireysel müşteride anlamı yok ve boş bir kutu "doldurulmalı
            mı" sorusu doğurur. VIES doğrulaması ayrı bir iştir (09.11) — burada yalnız numara tutulur. */}
        {type === 'company' ? (
          <FieldShell
            label="Vergi numarası"
            labelAside={<span className="font-ops-body text-ops-xs text-ops-muted">VIES doğrulaması B2B onayında</span>}
          >
            <Input value={vat} onChange={(e) => setVat(e.target.value)} mono placeholder="FR…" disabled={saving} />
          </FieldShell>
        ) : null}

        {/* ── Ticari ayarlar ── Kimlikten AYRI bölüm: ikisi de müşterinin ne ödeyeceğini ve nasıl
            ödeyeceğini belirler, kim olduğunu değil. Ayraç bu yüzden var. */}
        <div className="flex flex-col gap-3 border-t border-ops-line pt-3.5">
          <ToggleField label="Kapıda ödeme izni" on={cod} onChange={setCod} />
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
            {cod
              ? 'Varsayılan açık. Ödememe ya da ret geçmişi varsa kapatın.'
              : 'Kapalı — müşteri checkout’ta kapıda ödeme seçeneğini göremiyor.'}
          </span>

          {/* Fiyat grubu YALNIZ şirkette: kademe B2B listesinden düşer, bireysel müşteride motor
              yüzdeyi zaten uygulamaz — kutuyu göstermek "doldurulmalı mı" sorusu doğururdu (vergi
              numarasının aynı kuralı). Gruplar Fiyatlar ekranında yönetilir, burada yalnız atanır. */}
          {type === 'company' ? (
            <FieldShell
              label="Fiyat grubu"
              className="max-w-[260px]"
              labelAside={<span className="font-ops-body text-ops-xs text-ops-muted">B2B listeden düşer</span>}
            >
              <Select
                value={group}
                onChange={setGroup}
                options={[
                  { value: '', label: 'Grupsuz — düz liste' },
                  ...priceGroupOptions.map((g) => ({ value: g.id, label: `${g.name} · −%${g.percentOff}` })),
                ]}
              />
            </FieldShell>
          ) : null}

          <FieldShell
            label="İndirim oranı (%)"
            className="max-w-[200px]"
            error={oranGecersiz ? '%0 ile %100 arasında olmalı.' : undefined}
            // Boş bırakmak oranı KALDIRIR ve bu "%0" ile aynı şey değil: sıfır oranı tanımlı bırakır ve
            // müşteri fiyat ekranındaki "indirim oranı tanımlı müşteriler" listesinde görünmeye devam
            // eder. Operatörün "indirimi kaldır" niyeti boş kutudur — action sıfırı da `null`a çevirir.
            labelAside={<span className="font-ops-body text-ops-xs text-ops-muted">boş = oran yok</span>}
          >
            <Input
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              inputMode="decimal"
              mono
              placeholder="yok"
              disabled={saving}
              error={oranGecersiz ? 'x' : undefined}
            />
          </FieldShell>
        </div>
      </form>
    </Dialog>
  );
}
