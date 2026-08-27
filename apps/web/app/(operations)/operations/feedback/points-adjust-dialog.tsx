'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Combobox } from '@/components/operation/form/combobox';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Input } from '@/components/operation/form/input';
import type { PointsEntry } from '@lezzet/types';
import type { CustomerOption } from '@/lib/customer-options';
import { shortDateTime } from '@/components/operation/ui/format';
import { adjustPointsAction, loadPointsHistoryAction, searchPointsCustomersAction } from './actions';
import { POINTS_REASON_LABELS } from './feedback-labels';

/**
 * ELLE PUAN DÜZELTME (17.4, çizimdeki modal) — jest ya da hata telafisi, **iz kaydıyla**.
 *
 * Üç alan: müşteri (sabit, listeden geldi) · değişim · sebep. Çizimde dördüncü bir kutu daha var
 * ("Yeni bakiye", salt okunur) ve o burada da duruyor: operatör "+50" yazarken sonucu görmeli —
 * eksi yazıp bakiyeyi sıfırın altına düşürmek isteyip istemediğine ancak sonucu görünce karar verir.
 *
 * **Sebep zorunlu ve kapı da bunu zorluyor** (`note_required`). Formda önden elemek bir nezaket
 * değil, aynı kuralın iki kez söylenmesi: action doğrudan da çağrılabilir ve o zaman kapı reddeder.
 * İkisi de gerekli — burada operatöre "neden gönderilmedi" açıklanır, orada veri korunur.
 *
 * **MÜŞTERİ SEÇİCİSİ GELDİ (17.1, 28.08) — ama yalnız gerektiğinde çizilir.** Pencere artık iki
 * yerden açılıyor: puan satırından (müşteri belli) ve üst bardaki "Elle puan düzelt" düğmesinden
 * (müşteri belli DEĞİL). Seçici ikinci hâlin şartı — çizimde de o yüzden var; müşterisiz bir düğme,
 * basıldığında kime puan yazacağını bilmeyen bir pencere açardı.
 *
 * Satırdan açıldığında seçici GÖRÜNMÜYOR ve bu eski gerekçenin hâlâ doğru olan yarısı: müşteri
 * zaten seçilmiş, ikinci kez sormak yanlış müşteriye puan yazma ihtimalini açardı.
 *
 * **Bakiye artık PROP DEĞİL, kapıdan geliyor.** Eskiden tablodaki satırdan okunuyordu; seçiciyle
 * gelen müşteri tabloda hiç olmayabilir (tablo yalnız puanı OLANLARI listeliyor, seçici herkesi
 * arıyor) ve o hâlde "bugünkü bakiye" sıfır sanılırdı. Geçmişle aynı turda okunuyor.
 */

interface PointsAdjustDialogProps {
  /** Satırdan açıldıysa müşteri; üst bardan açıldıysa `null` — seçici o hâlde çizilir. */
  customer: { id: string; name: string } | null;
  onClose: () => void;
}

export function PointsAdjustDialog({ customer: initial, onClose }: PointsAdjustDialogProps) {
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(initial);
  const [options, setOptions] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);

  // Arama SUNUCUDA: müşteri listesi veriyle büyür, tamamını pencereye indirmek yanlış olurdu.
  // Gecikme (debounce) `Combobox`ın içinde — burada yalnız sonuç ve bekleme durumu tutulur.
  const search = (term: string) => {
    if (!term.trim()) {
      setOptions([]);
      return;
    }
    setSearching(true);
    void searchPointsCustomersAction(term)
      .then(({ data }) => setOptions(data ?? []))
      .finally(() => setSearching(false));
  };

  const customerId = customer?.id ?? null;
  const customerName = customer?.name ?? '';
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * GEÇMİŞ ÖNCE GELİR — pencere açılır açılmaz okunur.
   *
   * Karar sırası bunu gerektiriyor: operatör neyin üstüne yazdığını görmeden düzeltme yapmamalı.
   * Tablodaki üç kolon (bakiye · çevrilen · son) defterin ÖZETİ; "nereden geldi, ne zaman çevirdi"
   * sorusunun cevabı yalnız burada. Bu kapı bugüne dek operasyon yüzeyinde hiç çağrılmamıştı —
   * müşteri kendi hesabında geçmişini görüyordu, operatör göremiyordu.
   */
  const [history, setHistory] = useState<PointsEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [currentBalance, setCurrentBalance] = useState(0);

  useEffect(() => {
    // Müşteri seçilmeden okunacak bir defter yok — seçici bekliyor.
    if (!customerId) {
      setHistory(null);
      setHistoryError(null);
      setCurrentBalance(0);
      return;
    }
    let alive = true;
    setHistory(null);
    setHistoryError(null);
    void loadPointsHistoryAction(customerId).then((result) => {
      if (!alive) return;
      if (result.error || !result.data) {
        setHistoryError(result.error ?? 'Geçmiş okunamadı.');
        return;
      }
      setHistory(result.data.entries);
      setCurrentBalance(result.data.balance);
    });
    // Pencere kapanırken gelen cevap durumu yazmasın: React 18'de `setState` sökülmüş bileşende
    // sessizce yutulur ama niyet açık dursun. Müşteri DEĞİŞİNCE de aynı koruma gerekiyor — geç
    // gelen bir cevap, artık başka birinin açık olduğu pencereye yazardı.
    return () => {
      alive = false;
    };
  }, [customerId]);

  // Boş ya da bozuk girdi 0 sayılır: "yeni bakiye" o an bakiyenin kendisidir, NaN değil.
  const parsed = Number.parseInt(delta, 10);
  const change = Number.isFinite(parsed) ? parsed : 0;
  // Müşteri de şart: seçilmeden "Kaydet" basılabilseydi, kapı reddedene kadar operatör kaydettiğini
  // sanırdı.
  const canSubmit = customerId !== null && change !== 0 && reason.trim().length > 0 && !pending;

  const submit = () => {
    if (!customerId) return;
    setError(null);
    startTransition(async () => {
      const result = await adjustPointsAction({ customerId, delta: change, reason });
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Puan geçmişi ve düzeltme"
      // Müşteri seçilmeden bakiye YAZILMAZ: "bugünkü bakiye 0" cümlesi, seçilmemiş bir müşterinin
      // bakiyesi sıfırmış gibi okunur.
      subtitle={customer ? `${customerName} · bugünkü bakiye ${currentBalance}` : 'Önce müşteriyi seçin'}
      maxWidth={440}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            İptal
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>
            {pending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {error ? (
          <span className="rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red-dark">
            {error}
          </span>
        ) : null}

        {/* Seçici YALNIZ üst bardan açıldığında çizilir — satırdan gelindiğinde müşteri zaten
            belli ve ikinci kez sormak yanlış müşteriye puan yazma ihtimalini açardı. */}
        {initial === null ? (
          <FieldShell label="Müşteri" required>
            <Combobox
              value={customerId ?? ''}
              selectedLabel={customer?.name}
              onChange={(id) => {
                const found = options.find((c) => c.id === id);
                setCustomer(found ? { id: found.id, name: found.name } : null);
              }}
              options={options.map((c) => ({ value: c.id, label: c.name, meta: c.hint, trailing: c.isCompany ? 'B2B' : 'B2C' }))}
              onSearch={search}
              loading={searching}
              placeholder="Müşteri ara"
            />
          </FieldShell>
        ) : null}

        {/* Defterin kendisi — en yeni üstte (kapının sırası). Boş geçmiş de bir bilgi: "bu müşteri
            hiç puan hareketi yapmamış" ile "okuyamadım" ayrı şeyler ve ayrı yazılıyor.
            Müşteri seçilmeden bölüm hiç çizilmez: boş bir "hiç hareket yok" cümlesi, seçilmemiş
            müşteriyi hareketsiz gösterirdi. */}
        {customerId === null ? null : (
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.06em] text-ops-muted">Puan geçmişi</span>
          {historyError ? (
            <span className="font-ops-body text-ops-xs text-ops-amber-dark">{historyError}</span>
          ) : history === null ? (
            <span className="font-ops-body text-ops-xs text-ops-muted">Okunuyor…</span>
          ) : history.length === 0 ? (
            <span className="font-ops-body text-ops-xs text-ops-muted">Bu müşterinin hiç puan hareketi yok.</span>
          ) : (
            <div className="flex max-h-[168px] flex-col overflow-y-auto rounded-ops-card border border-ops-line">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2.5 border-b border-ops-line-soft px-3 py-2 last:border-b-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate font-ops-body text-ops-xs font-medium text-ops-strong">
                      {POINTS_REASON_LABELS[entry.reason]}
                    </span>
                    {/* Elle düzeltmenin GEREKÇESİ burada görünür — defterin var oluş sebebi o. */}
                    {entry.note ? <span className="truncate font-ops-body text-ops-micro text-ops-muted">{entry.note}</span> : null}
                  </div>
                  <span className="flex-none font-ops-mono text-ops-micro text-ops-muted">{shortDateTime(entry.createdAt)}</span>
                  <span className={`w-[52px] flex-none text-right font-ops-mono text-ops-xs font-semibold ${entry.points > 0 ? 'text-ops-olive-dark' : 'text-ops-red-dark'}`}>
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        <div className="flex gap-3">
          <FieldShell label="Değişim (± puan)" required className="flex-1">
            <Input
              value={delta}
              mono
              inputMode="numeric"
              placeholder="+50"
              onChange={(e) => setDelta(e.target.value)}
              aria-label="Değişim"
            />
          </FieldShell>
          <FieldShell label="Yeni bakiye" className="flex-1">
            {/* Salt okunur ve öyle GÖRÜNÜYOR (`disabled`): tıklanabilir bir kutu, yazılabilir sanılır. */}
            <Input value={String(currentBalance + change)} mono disabled readOnly aria-label="Yeni bakiye" />
          </FieldShell>
        </div>

        <FieldShell label="Sebep (iz kaydına yazılır)" required>
          <Input
            value={reason}
            placeholder="Gecikme telafisi — jest"
            onChange={(e) => setReason(e.target.value)}
            aria-label="Sebep"
          />
        </FieldShell>

        <span className="font-ops-body text-ops-xs text-ops-muted">
          Bu düzeltme deftere ayrı bir hareket olarak yazılır; bakiye hareketlerden türer, üzerine yazılmaz.
        </span>
      </div>
    </Dialog>
  );
}
