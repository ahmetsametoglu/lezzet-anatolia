'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Country } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { AlertIcon } from '@/components/operation/ui/icons';
import { COUNTRY_LABELS, COUNTRY_OPTIONS } from '@/components/operation/ui/labels';
import { FormInput } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { saveWarehouseAction } from './actions';
import { WarehouseFormSchema, type WarehouseFormInput, type WarehouseRowView } from './warehouses-types';

/**
 * Depo künyesi — ekleme ve düzenleme (19.5).
 *
 * **Nadir ve sonuçları ağır bir kurulum işi** (`design/pages/admin-depolar.md §7`): hız değil,
 * doğruluk ve geri dönülmezliğin anlaşılması önemli. O yüzden form üç yerde konuşuyor:
 *  · kodun belge parçası olduğu ve geçmişi değiştirmediği,
 *  · yeni bir ÜLKEDE ilk deponun vergi modelini değiştirdiği,
 *  · kargo çıkışı rolünün ülke başına tek olduğu ve bugün kimde durduğu.
 *
 * **Aktiflik burada YOK.** Kapatma dört ayrı sonucu olan bir karardır ve kendi penceresinde onaylanır;
 * bir form anahtarı olsaydı "kaydet"e basmanın yan etkisi hâline gelirdi. Alt barda yalnız o pencereyi
 * AÇAN düğme var.
 */
const FORM_ID = 'warehouse-form';

interface WarehouseDialogProps {
  /** null = yeni tesis. */
  editing: WarehouseRowView | null;
  /** Aktif deposu olan ülkeler — "yeni ülkede ilk depo" mali uyarısı bundan türer. */
  countriesWithWarehouse: readonly Country[];
  /** Kargo çıkış rolünü BUGÜN taşıyan aktif depolar — reddi gerekçesiyle anlatmak için. */
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
      // Varsayılan ülke YOK sayılmaz: bugün hizmet verdiğimiz ilk ülke Fransa ve yeni tesisin
      // oradan doğması olağan hâl. Ülke değişince mali uyarı zaten belirir.
      countryCode: editing?.countryCode ?? 'FR',
      shipsOnline: editing?.shipsOnline ?? false,
      address: {
        line1: editing?.address?.line1 ?? '',
        postalCode: editing?.address?.postalCode ?? '',
        city: editing?.address?.city ?? '',
      },
    },
    mode: 'onChange',
  });

  const country = useWatch({ control: form.control, name: 'countryCode' });
  const shipsOnline = useWatch({ control: form.control, name: 'shipsOnline' });

  // Rolü BUGÜN taşıyan depo (kendisi hariç). Kural veritabanında; buradaki okuma yalnız cümle kurmak
  // için — kayıt yine de kısıta çarpar ve action onu okunur bir hataya çevirir.
  const holder = shippingTakenBy.find((w) => w.countryCode === country && w.id !== editing?.id) ?? null;
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

        <div className="flex flex-col gap-2">
          <FormSwitch control={form.control} name="shipsOnline" label="Kargo çıkış deposu" />
          {/* Rol DOLU ise reddi ÖNCEDEN söylüyoruz: kaydedip hata almak yerine, devretmenin yolunu
              gösteren bir cümle. Kural yine de veritabanında — bu blok onun yerine geçmez. */}
          {shipsOnline && holder ? (
            <Notice tone="red">
              <strong>
                {COUNTRY_LABELS[country]}'da bu rolü {holder.name} ({holder.code}) taşıyor.
              </strong>{' '}
              Ülke başına en fazla bir kargo çıkış deposu olabilir — kural veritabanındadır. Devretmek istiyorsanız önce{' '}
              {holder.code} künyesinden kaldırın.
            </Notice>
          ) : (
            <span className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
              Bölge dışı müşterilere ve rota müşterilerinin kargo dolgusuna hizmet eden depo.{' '}
              {holder ? `${COUNTRY_LABELS[country]}'da bu rol şu an ${holder.code}'de.` : `${COUNTRY_LABELS[country]}'da henüz kargo deposu yok — işaretlenebilir.`}
            </span>
          )}
        </div>

        {!editing ? (
          <Notice tone="neutral">
            Yeni depo <strong>kurulumu eksik</strong> doğar: bağlı bölgesi ve kargo çıkışı olmayan tesis hiçbir siparişi
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
