'use client';

import { useState } from 'react';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { Select } from '@/components/operation/form/select';
import { ToggleField } from '@/components/operation/form/toggle';
import {
  CustomerTypeEnum,
  PreferredLanguageEnum,
  type Country,
  type CustomerPriceBasis,
  type CustomerType,
  type PreferredLanguage,
} from '@lezzet/types';
import { COUNTRY_OPTIONS } from '@/components/operation/ui/labels';
import { priceRuleError } from '@/lib/pricing/price-rule-label';
import { TYPE_LABEL } from '../customers-url';
import type { CustomerEditInput, CustomerRow } from '../customers-types';

/**
 * Müşteri bilgisi düzenleme: kimlik, iletişim ve iki ticari ayar (kapıda ödeme, genel fiyat kuralı) tek formda tek kayıtla.
 * Vade ayrı diyalogdadır, türetilmiş değerler ve pazarlama izni hiç düzenlenmez; tekillik DB kısıtındadır.
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
  /** Gel-al izni — depodan teslim yalnız işaretli müşteriye sunulur; detaydan gelir. */
  pickupAllowed: boolean;
  /** Genel fiyat kuralı; ikisi birlikte dolu ya da boş. */
  priceRuleBasis: CustomerPriceBasis | null;
  priceRulePercent: number | null;
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
  pickupAllowed,
  priceRuleBasis,
  priceRulePercent,
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
  const [pickup, setPickup] = useState(pickupAllowed);
  // Kuralın yokluğu '' ile temsil edilir (Select string ister); yüzde metin tutulur, çünkü boş kutu sayı state'inde temsil edilemez.
  const [ruleBasis, setRuleBasis] = useState<CustomerPriceBasis | ''>(priceRuleBasis ?? '');
  const [rulePercent, setRulePercent] = useState(priceRulePercent === null ? '' : String(priceRulePercent));
  // Grup boşluğu '' ile temsil edilir (Select string ister); kaydederken null'a döner.
  const [group, setGroup] = useState(priceGroupId ?? '');

  const adBos = name.trim() === '';
  // Her iki kimlik anahtarı da boşsa kayıt bir daha BULUNAMAZ: ne telefonla ne e-postayla. Ad tek
  // başına kimlik değil (iki "Ahmet Yılmaz" olabilir).
  const kimliksiz = phone.trim() === '' && email.trim() === '';
  const kuralYuzde = rulePercent.trim() === '' ? null : Number(rulePercent.replace(',', '.'));
  const kuralHatasi = ruleBasis ? priceRuleError(ruleBasis, kuralYuzde) : null;

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
                : kuralHatasi
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
            pickupAllowed: pickup,
            priceRuleBasis: ruleBasis || null,
            priceRulePercent: ruleBasis ? kuralYuzde : null,
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

        {/* Vergi numarası yalnız şirkette; bireyselde boş kutu "doldurulmalı mı" sorusu doğururdu. */}
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

          {/* Gel-al herkese açık değil: depodan teslimi telefonla randevulaşan anlaşmalı müşteri alır (DOMAIN §6). */}
          <ToggleField label="Gel-al izni" on={pickup} onChange={setPickup} />
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
            {pickup
              ? 'Açık — müşteri checkout’ta "depodan teslim al" seçeneğini görür; saati depoyla telefonla kararlaştırır.'
              : 'Kapalı (varsayılan) — depodan teslim seçeneği bu müşteriye sunulmaz.'}
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

          <div className="grid grid-cols-[1fr_140px] gap-3">
            <FieldShell label="Genel fiyat kuralı">
              <Select
                value={ruleBasis}
                onChange={(v) => setRuleBasis(v as CustomerPriceBasis | '')}
                options={[
                  { value: '', label: 'Yok — liste fiyatı' },
                  { value: 'list', label: 'Liste fiyatından indirim' },
                  { value: 'cost', label: 'Alış fiyatı üzerine pay' },
                ]}
              />
            </FieldShell>
            {ruleBasis ? (
              <FieldShell label="Yüzde (%)" error={kuralHatasi ?? undefined}>
                <Input
                  value={rulePercent}
                  onChange={(e) => setRulePercent(e.target.value)}
                  inputMode="decimal"
                  mono
                  disabled={saving}
                  error={kuralHatasi ? 'x' : undefined}
                />
              </FieldShell>
            ) : null}
          </div>
          {ruleBasis ? (
            <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
              Ürün bazlı özel fiyatla aynı basamaktadır: grup ya da liste fiyatından ucuzsa geçerli olur, vitrinde görünür ve
              üstüne kupon dahil indirim uygulanmaz.{' '}
              {ruleBasis === 'cost' ? 'Alış fiyatı bilinmeyen ya da son alışı olağandışı sapan üründe liste fiyatı geçerlidir.' : ''}
            </span>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
