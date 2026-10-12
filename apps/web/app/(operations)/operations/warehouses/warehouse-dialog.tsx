'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Country } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { AlertIcon } from '@/components/operation/ui/icons';
import { COUNTRY_LABELS, COUNTRY_OPTIONS } from '@/components/operation/ui/labels';
import { BUSINESS_OPTIONS } from '@/components/operation/form/business-field';
import { FormInput } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { saveWarehouseAction } from './actions';
import { orderedShipCountries, shipConflicts, shipCountryFields } from './ship-countries';
import { WarehouseFormSchema, type WarehouseFormInput, type WarehouseRowView } from './warehouses-types';

/**
 * Depo künyesi, ekleme ve düzenleme: nadir ve sonuçları ağır bir kurulum işi olduğu için form kodun belge parçası olduğunu, yeni ülkede
 * ilk deponun vergi modelini değiştirdiğini ve bir ülkeye tek deponun kargo yaptığını söyler. Aktiflik burada yok, çünkü kapatma dört
 * sonucu olan ayrı bir karardır ve kendi penceresinde onaylanır.
 */
const FORM_ID = 'warehouse-form';

interface WarehouseDialogProps {
  /** null = yeni tesis. */
  editing: WarehouseRowView | null;
  /** Aktif deposu olan ülkeler — "yeni ülkede ilk depo" mali uyarısı bundan türer. */
  countriesWithWarehouse: readonly Country[];
  /** Bugün kargo yapan aktif depolar; ülke çakışmasını kaydetmeden önce söylemek için. */
  shippingTakenBy: readonly WarehouseRowView[];
  onClose: () => void;
  onSaved: (code: string) => void;
  /** Kapatma penceresini açar — kayıtlı tesiste. */
  onRequestClose: (row: WarehouseRowView) => void;
}

export function WarehouseDialog({
  editing,
  countriesWithWarehouse,
  shippingTakenBy,
  onClose,
  onSaved,
  onRequestClose,
}: WarehouseDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const form = useForm<WarehouseFormInput>({
    resolver: zodResolver(WarehouseFormSchema),
    defaultValues: {
      code: editing?.code ?? '',
      name: editing?.name ?? '',
      // Etiketsiz depo Lezzet'tir (docs/feature/iki-is.md 6. karar).
      business: editing?.business ?? 'lezzet',
      // Varsayılan ülke YOK sayılmaz: bugün hizmet verdiğimiz ilk ülke Fransa ve yeni tesisin
      // oradan doğması olağan hâl. Ülke değişince mali uyarı zaten belirir.
      countryCode: editing?.countryCode ?? 'FR',
      shipCountries: shipCountryFields(editing),
      pickupEnabled: editing?.pickupEnabled ?? false,
      address: {
        line1: editing?.address?.line1 ?? '',
        postalCode: editing?.address?.postalCode ?? '',
        city: editing?.address?.city ?? '',
      },
      // Kayıtlı nokta varsa gösterilir; boşsa kapı adresten çözer.
      lat: editing?.lat == null ? '' : String(editing.lat),
      lng: editing?.lng == null ? '' : String(editing.lng),
    },
    mode: 'onChange',
  });

  const country = useWatch({ control: form.control, name: 'countryCode' });
  const shipFields = useWatch({ control: form.control, name: 'shipCountries' });
  const business = useWatch({ control: form.control, name: 'business' });

  // Kural veritabanındadır ve kayıt yine kısıta çarpar; buradaki okuma reddi kaydetmeden önce söylemek içindir.
  const conflicts = shipConflicts(shipFields, shippingTakenBy, editing?.id ?? null);
  const shipping = shipFields.some((field) => field.enabled);
  const firstInCountry = !countriesWithWarehouse.includes(country) && editing?.countryCode !== country;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { data, error: actionError } = await saveWarehouseAction({ id: editing?.id, ...values });
    if (actionError || !data) {
      setError(actionError ?? 'Depo kaydedilemedi.');
      return;
    }
    onSaved(data.code);
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? `${editing.name} künyesi` : 'Depo ekle'}
      subtitle={editing ? `${editing.code} · sıra ${editing.sortOrder}` : 'Nadir ve sonuçları ağır bir kurulum işi'}
      maxWidth={520}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={form.formState.isSubmitting}
          error={error}
          submitLabel={editing ? 'Kaydet' : 'Depoyu aç'}
          // Kapatma/açma kayda EŞLİK EDEN bir karar değil, ayrı bir karar — ama girişi burada:
          // künyeye bakan kişi tesisin geleceğine de burada karar verir.
          actions={
            editing ? (
              <Button
                variant={editing.isActive ? 'danger' : 'secondary'}
                onClick={() => onRequestClose(editing)}
                disabled={form.formState.isSubmitting}
              >
                {editing.isActive ? 'Depoyu kapat' : 'Yeniden aç'}
              </Button>
            ) : null
          }
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
          <FormInput control={form.control} name="code" label="Kod" required mono placeholder="STR" />
          <FormInput control={form.control} name="name" label="Ad" required placeholder="Strasbourg" />
        </div>
        <span className="-mt-2 font-ops-body text-ops-xs leading-relaxed text-ops-muted">
          {editing ? (
            <>
              Kodu değiştirmek geçmiş belgeleri DEĞİŞTİRMEZ — <strong>IMH-{editing.code}-…</strong> ve öncesi eski
              önekle kalır. Yeni belgeler yeni öneki alır.
            </>
          ) : (
            'Kod belge parçasıdır: imha tutanağı ve transfer numarası bunu taşır, denetmen elle yazar. Kısa, okunur, karışmaz olmalı.'
          )}
        </span>

        {/* Stok, mal kabul ve sipariş işini depodan alır; kural ve kilit veritabanında, burada yalnız kilidin sebebi okunur. */}
        <FormSelect
          control={form.control}
          name="business"
          label="İş"
          options={BUSINESS_OPTIONS}
          required
          disabled={editing?.kind === 'vehicle' || editing?.businessLocked}
          labelAside={
            editing?.kind === 'vehicle'
              ? 'aracın işi evinin işidir'
              : editing?.businessLocked
                ? 'depo kullanıldığı için değişmez'
                : 'stok ve sipariş işini depodan alır'
          }
        />

        <FormSelect control={form.control} name="countryCode" label="Ülke" options={COUNTRY_OPTIONS} required />

        {/* Yeni ÜLKEDE ilk depo — mali uyarı. Alan bir beyandır, kural Ayarlar'da tanımlıdır. */}
        {firstInCountry ? (
          <Notice tone="amber">
            <strong>{COUNTRY_LABELS[country]} için ilk depo — vergi modeli değişir.</strong> Yeni bir ülkede depo açmak
            KDV kurulumunu etkiler; mali danışmana sorulmadan açılmaz. Kural Ayarlar'da tanımlıdır, bu alan yalnız
            beyandır.
          </Notice>
        ) : null}

        <FormInput control={form.control} name="address.line1" label="Adres" required placeholder="14 Rue de la Course" />
        <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3">
          <FormInput control={form.control} name="address.postalCode" label="Posta kodu" required mono placeholder="67000" />
          <FormInput control={form.control} name="address.city" label="Şehir" required placeholder="Strasbourg" />
        </div>
        {/* Deponun noktası rotanın çıpasıdır: kurye rotası buradan başlayıp buraya döner, nokta yoksa rotalar sıralanamaz. Boşsa
            kaydederken adresten çözülür, doluysa operatörün değeri kazanır, çünkü yanlış bir çıpa her rotayı bozar. */}
        <div className="grid grid-cols-2 gap-3">
          <FormInput control={form.control} name="lat" label="Enlem" mono placeholder="boş bırak — adresten çözülür" />
          <FormInput control={form.control} name="lng" label="Boylam" mono placeholder="boş bırak — adresten çözülür" />
        </div>

        {/* Gel-al noktası: müşteriye adresi gösterilen tek yer (DOMAIN §17'nin bilinçli istisnası); yalnız izinli müşteri görür. */}
        <FormSwitch control={form.control} name="pickupEnabled" label="Gel-al noktası — izinli müşteri hazır siparişini buradan alır" />

        {editing?.kind === 'vehicle' ? null : (
          <div className="flex flex-col gap-2">
            <span className="font-ops-body text-ops-xs text-ops-body">Kargo ülkeleri</span>
            {orderedShipCountries(
              shipFields.map((field, index) => ({ ...field, index })),
              country,
            ).map((field) => {
              const holder = conflicts.get(field.country);
              return (
                <div key={field.country} className="flex flex-col gap-2">
                  <FormSwitch control={form.control} name={`shipCountries.${field.index}.enabled`} label={COUNTRY_LABELS[field.country]} />
                  {/* Deponun kendi ülkesinde paket depodan verilir; teslim noktası yalnız öteki ülkede sorulur. */}
                  {field.enabled && field.country !== country ? (
                    <div className="flex flex-col gap-2 border-l-2 border-ops-line pl-3">
                      <span className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
                        <strong className="font-semibold text-ops-body">Teslim noktası</strong>, paketin taşıyıcıya verildiği adrestir. Boş
                        bırakılırsa paket depodan verilir.
                      </span>
                      <FormInput
                        control={form.control}
                        name={`shipCountries.${field.index}.handover.line1`}
                        label="Adres"
                        placeholder="Rheinstraße 10"
                      />
                      <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3">
                        <FormInput
                          control={form.control}
                          name={`shipCountries.${field.index}.handover.postalCode`}
                          label="Posta kodu"
                          mono
                          placeholder="77694"
                        />
                        <FormInput
                          control={form.control}
                          name={`shipCountries.${field.index}.handover.city`}
                          label="Şehir"
                          placeholder="Kehl"
                        />
                      </div>
                    </div>
                  ) : null}
                  {holder ? (
                    <Notice tone="red">
                      <strong>
                        Bu ülkeye başka bir depo kargo yapıyor: {holder.name} ({holder.code}).
                      </strong>{' '}
                      Bir ülkeye tek aktif depo kargo yapar — kural veritabanındadır. Devretmek için önce {holder.code} künyesinden
                      kaldırın.
                    </Notice>
                  ) : null}
                </div>
              );
            })}
            {shipping && business === 'qualite' ? (
              <Notice tone="red">
                <strong>QUALITE kargo göndermez.</strong> Kargo ülkesi yalnız Lezzet deposuna verilir — kural veritabanındadır.
              </Notice>
            ) : (
              <span className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
                Bölge dışı müşterilere ve rota müşterilerinin kargo dolgusuna hizmet eder. Bir ülkeye tek aktif depo kargo yapar.
              </span>
            )}
          </div>
        )}

        {!editing ? (
          <Notice tone="neutral">
            Yeni depo <strong>kurulumu eksik</strong> doğar: bağlı bölgesi ve kargo ülkesi olmayan tesis hiçbir siparişi
            alamaz, kapsamlı personeli olmayan depoda mal kabul edilemez. Sıradaki adımlar kaydedince açılan kartta:
            hizmet alanına bölge bağlayın, Ayarlar'dan personel kapsamı verin.
          </Notice>
        ) : null}
      </form>
    </Dialog>
  );
}

const NOTICE_TONE = {
  amber: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber',
  red: 'border-ops-red-line bg-ops-red-bg text-ops-red',
  neutral: 'border-ops-line bg-ops-line-soft text-ops-body',
} as const;

/** Form içi uyarı kutusu — sebep + yol. Yalnız "olmaz" diyen bir kutu, operatörü yalnız bırakır. */
function Notice({ tone, children }: { tone: keyof typeof NOTICE_TONE; children: React.ReactNode }) {
  return (
    <div className={['flex items-start gap-2.5 rounded-ops-card border px-3 py-2.5', NOTICE_TONE[tone]].join(' ')}>
      {tone === 'neutral' ? null : (
        <span className="mt-px flex-none">
          <AlertIcon size={15} />
        </span>
      )}
      <span className="font-ops-body text-ops-sm leading-relaxed">{children}</span>
    </div>
  );
}
