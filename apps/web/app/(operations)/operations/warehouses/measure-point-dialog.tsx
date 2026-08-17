'use client';

import { useState } from 'react';
import { useForm, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { FormInput } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { saveStorageAreaAction, saveVehicleAction } from './actions';
import { AREA_KIND_OPTIONS, DAILY_CHECK_OPTIONS } from './warehouses-labels';
import {
  StorageAreaFormSchema,
  VehicleFormSchema,
  type MeasurePointView,
  type StorageAreaFormInput,
  type VehicleFormInput,
} from './warehouses-types';

/**
 * **Ölçüm noktası** — depo içi alan ya da araç, ekleme/düzenleme (19.28).
 *
 * Tek pencere iki formu taşıyor ve ayrımı `kind` yapıyor: operatörün açtığı düğme zaten hangisini
 * eklediğini söylüyor ("+ Alan" / "+ Araç"), yani pencerede bir tür seçici olsaydı aynı soruyu iki
 * kez sormuş olurduk. Kayıtlı bir noktanın TÜRÜ değişmiyor — dolap araca dönüşmez.
 *
 * **Depo forma girmiyor:** nokta seçili tesisin künyesidir, kimliği sunucuya karttan gidiyor.
 */
const FORM_ID = 'measure-point-form';

interface MeasurePointDialogProps {
  warehouseId: string;
  /** Düzenlenen nokta; `null` ise yeni ve türü `kind` söyler. */
  editing: MeasurePointView | null;
  kind: 'area' | 'vehicle';
  onClose: () => void;
  onSaved: () => void;
}

export function MeasurePointDialog({ warehouseId, editing, kind, onClose, onSaved }: MeasurePointDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const title = kind === 'area' ? (editing ? 'Alanı düzenle' : 'Alan ekle') : editing ? 'Aracı düzenle' : 'Araç ekle';

  return (
    <Dialog
      open
      title={title}
      subtitle={
        kind === 'area'
          ? 'Sıcaklık kaydı bu alana yazılır — hijyen denetiminin sorduğu nokta.'
          : 'Araç da bir ölçüm noktasıdır: soğuk zincirin yoldaki yeri.'
      }
      maxWidth={520}
      onClose={onClose}
      footer={<DialogFooter formId={FORM_ID} onCancel={onClose} error={error} />}
    >
      {kind === 'area' ? (
        <AreaForm warehouseId={warehouseId} editing={editing} onSaved={onSaved} onError={setError} />
      ) : (
        <VehicleForm warehouseId={warehouseId} editing={editing} onSaved={onSaved} onError={setError} />
      )}
    </Dialog>
  );
}

function AreaForm({
  warehouseId,
  editing,
  onSaved,
  onError,
}: {
  warehouseId: string;
  editing: MeasurePointView | null;
  onSaved: () => void;
  /** Hata alt barda yaşıyor (`DialogFooter`), formda değil: kaydet düğmesinin yanında okunmalı. */
  onError: (message: string | null) => void;
}) {
  const form = useForm<StorageAreaFormInput>({
    resolver: zodResolver(StorageAreaFormSchema),
    defaultValues: {
      name: editing?.name ?? '',
      kind: editing?.areaKind ?? 'chilled',
      // Sayı DEĞİL metin: boş bırakılabilmesi gerek ve boş bir sayı alanı `0`a düşer — sıfır derece
      // geçerli bir beklenti olduğu için boşluk sıfırdan ayırt edilemez hâle gelirdi (`CLAUDE §1`).
      targetMinC: editing?.targetMinC?.toString() ?? '',
      targetMaxC: editing?.targetMaxC?.toString() ?? '',
      expectedDailyChecks: editing?.expectedDailyChecks ?? 1,
    },
  });

  const submit = form.handleSubmit(async (values) => {
    onError(null);
    const { error: failed } = await saveStorageAreaAction({ ...values, warehouseId, id: editing?.id });
    if (failed) {
      onError(failed);
      return;
    }
    onSaved();
  });

  return (
    <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
      <FormInput control={form.control} name="name" label="Ad" required placeholder="Dondurucu 1" />
      <FormSelect control={form.control} name="kind" label="Tür" options={AREA_KIND_OPTIONS} />

      <div className="flex items-start gap-2.5">
        <FormInput control={form.control} name="targetMinC" label="Hedef en az (°C)" placeholder="−20" />
        <FormInput control={form.control} name="targetMaxC" label="Hedef en çok (°C)" placeholder="−16" />
      </div>
      {/* Aralığın NE İŞE YARADIĞI yazılıyor, çünkü boş bırakmak da geçerli bir karar: beklentisi
          olmayan bir raf için uydurulmuş bir aralık, ölçülmeyen bir eşiği ölçülmüş gibi gösterir. */}
      <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
        Aralık verilirse ölçüm dışına çıkınca <strong>kesin sapma</strong> yazılır. Boş bırakılırsa sapma noktanın kendi
        geçmişinden tahmin edilir — ilk günlerde susar. İkisini birlikte verin ya da ikisini de boş bırakın.
      </p>

      <DailyChecksField control={form.control} />
    </form>
  );
}

/**
 * **Günde kaç ölçüm bekleniyor** (19.30) — takvimin "eksik gün" ölçütü, ve iki formun ortak alanı.
 *
 * Alan gelmeden önce "eksik" diye bir şey söylenemiyordu: kayıt yoksa sıfır kayıt görülüyordu ama
 * *"sabah alındı, akşam alınmadı"* görülemiyordu — yarım kalmış bir tur, hiç yapılmamış bir tur
 * kadar sessizdi.
 *
 * **Sıfır bir kaçış değil, bir CEVAP** ve seçenek metninde de öyle yazıyor: oda sıcaklığı rafından
 * günlük ölçüm beklenmez ve o noktanın boş günlerini eksik saymak, denetimi gerçek eksiklere kör
 * eden bir gürültü üretirdi.
 */
function DailyChecksField({ control }: { control: Control<StorageAreaFormInput> | Control<VehicleFormInput> }) {
  return (
    <>
      <FormSelect
        // İki formun `Control` tipi farklı (alanlarının kümesi farklı) ama alan aynı alan; tek
        // seçenek listesi ve tek künye için burada birleşiyorlar.
        control={control as Control<StorageAreaFormInput>}
        name="expectedDailyChecks"
        label="Günde beklenen ölçüm"
        options={DAILY_CHECK_OPTIONS}
      />
      <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
        Takvimde <strong>eksik gün</strong> bu sayıya göre işaretlenir. "Beklenmiyor" seçilirse o noktanın boş günleri
        eksik sayılmaz — beklenmeyen bir ölçümün yokluğu bir ihlal değildir.
      </p>
    </>
  );
}

function VehicleForm({
  warehouseId,
  editing,
  onSaved,
  onError,
}: {
  warehouseId: string;
  editing: MeasurePointView | null;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const form = useForm<VehicleFormInput>({
    resolver: zodResolver(VehicleFormSchema),
    // Araçta varsayılan **0**: soğutuculu araç da var sıradan araç da, ayrım veride tutulmuyor —
    // her araçtan günlük ölçüm beklemek yarısı için her gün yalancı bir eksik üretirdi.
    defaultValues: { plate: editing?.name ?? '', label: editing?.label ?? '', expectedDailyChecks: editing?.expectedDailyChecks ?? 0 },
  });

  const submit = form.handleSubmit(async (values) => {
    onError(null);
    const { error: failed } = await saveVehicleAction({ ...values, warehouseId, id: editing?.id });
    if (failed) {
      onError(failed);
      return;
    }
    onSaved();
  });

  return (
    <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
      <FormInput control={form.control} name="plate" label="Plaka" required placeholder="67 ABC 123" />
      <FormInput control={form.control} name="label" label="Etiket" placeholder="Küçük kamyonet" />
      <DailyChecksField control={form.control} />
      {/* Aracın bu tesise KÜNYELENDİĞİ söyleniyor, "ait olduğu" değil: aidiyet bir kısıt olurdu ve
          araç bugün hiçbir güne, kuryeye ya da depoya bağlanmıyor (`DOMAIN §17`). */}
      <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
        Araç bu tesisin künyesine yazılır — genelde buradan yüklediği için. Bir güne ya da kuryeye bağlanmaz; sıcaklık
        kaydı hangi tesiste alındıysa oraya yazılır.
      </p>
    </form>
  );
}
