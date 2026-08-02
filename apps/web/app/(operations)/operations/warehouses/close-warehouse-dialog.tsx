'use client';

import { useState } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import { setWarehouseActiveAction } from './actions';
import { CLOSURE_WEIGHT_LABEL, CLOSURE_WEIGHT_ORDER, CLOSURE_WEIGHT_TONE } from './warehouses-labels';
import { closureConsequences } from './warehouses-read';
import type { WarehouseCardView, WarehouseRowView } from './warehouses-types';

/**
 * Depoyu kapat / yeniden aç.
 *
 * **Kapatmanın dört ayrı sonucu var ve hepsi aynı ağırlıkta değil** — stoğu görünmez olur, adresler
 * sahipsiz kalır, tek kapsamı burası olan personel kapalı kapıya düşer, yoldaki sevkiyat kabul
 * edilecek yer bulamaz. Tek bir "emin misiniz?" cümlesi bunları anlatmaz; anlatmadığı için de
 * okunmaz. Bu pencerenin tamamı o cümlenin açılımıdır.
 *
 * **Silme YOKTUR** ve bu ekranda hiç bulunmaz: geçmiş sipariş ve parti hangi tesisten çıktığını
 * bilmek zorundadır. Kapatma geri alınabilir; kapalı kaldığı süre boyunca o deponun stoğu satış
 * okumalarında yok sayılır — mal kayıtta durur.
 *
 * **Yeniden açmada onay sorulmaz.** Kapıyı AÇMAK bir sonuç doğurmaz; tesisi yeniden görünür kılar.
 * Sonuç doğuran eylemi onaylatmak bir güvence, doğurmayanı onaylatmak bir gürültüdür.
 */
interface CloseWarehouseDialogProps {
  row: WarehouseRowView;
  /** Seçili tesisin tam kartı — sonuçlar buradan türer. `null` = liste görünümünden açıldı. */
  card: WarehouseCardView | null;
  onClose: () => void;
  onDone: () => void;
}

export function CloseWarehouseDialog({ row, card, onClose, onDone }: CloseWarehouseDialogProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reopening = !row.isActive;
  const consequences = card
    ? [...closureConsequences(card)].sort((a, b) => CLOSURE_WEIGHT_ORDER[a.weight] - CLOSURE_WEIGHT_ORDER[b.weight])
    : [];

  const submit = () => {
    setSubmitting(true);
    setError(null);
    void setWarehouseActiveAction({ id: row.id, isActive: reopening, confirmCode: code })
      .then((result) => {
        if (result.error) setError(result.error);
        else onDone();
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={reopening ? `${row.name} deposunu yeniden aç` : `${row.name} deposunu kapat`}
      subtitle={
        reopening
          ? 'Tesis yeniden görünür olur: seçicilerde, süzgeçlerde ve transfer hedefinde yerini alır.'
          : 'Dört ayrı sonucu var ve hepsi aynı ağırlıkta değil. Tek bir “emin misiniz?” cümlesi bunları anlatmaz.'
      }
      maxWidth={540}
      footer={
        <>
          <span className="mr-auto font-ops-body text-ops-xs font-semibold text-ops-red">{error}</span>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Vazgeç
          </Button>
          <Button
            variant={reopening ? 'primary' : 'destructive'}
            onClick={submit}
            // Kapatmada kod yazılmadan düğme AÇILMAZ: yıkıcı eylem kazara tıklanamamalı. Kapı da
            // aynı kodu istiyor — istemciye güvenerek yazılan bir yıkıcı eylem hiçbir yerde durmaz.
            disabled={submitting || (!reopening && code.trim().toLocaleUpperCase('tr') !== row.code)}
          >
            {submitting ? 'Uygulanıyor…' : reopening ? 'Yeniden aç' : 'Depoyu kapat'}
          </Button>
        </>
      }
    >
      {reopening ? (
        <p className="font-ops-body text-ops-base leading-relaxed text-ops-body">
          {row.name} ({row.code}) yeniden açılacak. Kapatılırken kargo çıkış rolü kaldırılmıştı; gerekiyorsa künyeden
          yeniden işaretleyin — ülke başına yalnız bir depo o rolü taşıyabilir.
        </p>
      ) : (
        <>
          {consequences.length === 0 ? (
            <p className="font-ops-body text-ops-base leading-relaxed text-ops-body">
              {card
                ? 'Bu tesisin bağlı bölgesi, stoğu, kapsamlı personeli ve yoldaki sevkiyatı yok — kapatmanın bugün bilinen bir sonucu görünmüyor. Geçmiş kayıtları yine de bu tesisi göstermeye devam eder.'
                : 'Sonuçlar yalnız tesis kartı açıkken sayılabiliyor. Kapatmadan önce kartı açıp bölge, stok, personel ve yoldaki sevkiyat durumuna bakın.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {consequences.map((c) => (
                <div
                  key={c.title}
                  className={['flex items-start gap-2.5 rounded-ops-card border px-3.5 py-3', TONE[CLOSURE_WEIGHT_TONE[c.weight]]].join(' ')}
                >
                  <span className="flex-none rounded-ops-btn border border-current bg-ops-card px-2 py-0.5 font-ops-display text-ops-micro font-bold">
                    {CLOSURE_WEIGHT_LABEL[c.weight]}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-ops-display text-ops-base font-semibold">{c.title}</span>
                    <span className="font-ops-body text-ops-sm leading-relaxed text-ops-strong">{c.body}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-ops-line-soft pt-3.5">
            <FieldShell label="Onaylamak için deponun kodunu yazın">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={row.code} mono autoFocus />
            </FieldShell>
            <span className="font-ops-body text-ops-xs leading-relaxed text-ops-muted">
              Kapatma geri alınabilir (yeniden açma), ama <strong>kapalı kaldığı süre boyunca</strong> bu deponun stoğu
              satış okumalarında yok sayılır — mal kayıtta durur. Kargo çıkış rolü de kaldırılır.
            </span>
          </div>
        </>
      )}
    </Dialog>
  );
}

const TONE = {
  red: 'border-ops-red-line bg-ops-red-bg text-ops-red',
  amber: 'border-ops-amber-line bg-ops-amber-bg text-ops-amber',
  blue: 'border-ops-blue-line bg-ops-blue-bg text-ops-blue',
  neutral: 'border-ops-line bg-ops-line-soft text-ops-body',
  olive: 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark',
  slate: 'border-ops-slate-line bg-ops-slate-bg text-ops-slate',
} as const;
