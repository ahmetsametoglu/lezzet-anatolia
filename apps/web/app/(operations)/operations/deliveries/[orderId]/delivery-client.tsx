'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { derivePaymentStatusForOrder } from '@lezzet/domain-core';
import { fromCents, toCents } from '@lezzet/helper';
import type { FulfillmentAdjustment } from '@lezzet/types';
import { confirmDeliveryAction, markUndeliveredAction, startDeliveryAction } from './actions';
import { DeliveryStopDesktop } from './delivery.desktop';
import type { DeliveryStopView, DoorMethod, ProofDraft } from './delivery-types';

/**
 * Kapıdaki durağın istemci kökü — kuryenin kapıda verdiği kararların tutulduğu yer.
 *
 * ── TUTAR EKRANDA HESAPLANMAZ ───────────────────────────────────────────────
 * Eksik kalem işaretlendiğinde tahsil edilecek tutarı düşüren şey bir çarpma değil, **motorun ödeme
 * türetimi** (`derivePaymentStatusForOrder`). Kalem satırları şemanın alan adlarını birebir taşıdığı
 * için motora olduğu gibi veriliyor; ekranın yaptığı tek şey `fulfilledQty`'yi kuryenin söylediğiyle
 * değiştirmek. Aynı fonksiyon yazımdan sonra sunucuda da koşuyor — ekranda görünen tutar ile
 * kaydedilen tutar bu yüzden ayrışamaz.
 *
 * Motor SAF (DB bilmez), o yüzden istemcide çalışması bir sınır ihlali değil: kapıda her dokunuşta
 * sunucuya sormak, şebekesi zayıf bir sokakta rakamı bekleten bir ekran demek olurdu.
 *
 * ── URL DURUMU YOK ──────────────────────────────────────────────────────────
 * Kapıdaki seçimler (kaç adet verildi, hangi yöntem) paylaşılacak bir görünüm değil, bir işlemin
 * yarısıdır; adrese yazılsalardı geri düğmesi yarım bir teslimatı geri getirirdi.
 */
export function DeliveryClient({ view }: { view: DeliveryStopView }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [given, setGiven] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<DoorMethod>(doorMethodOf(view));
  /** `null` = "motorun türetimini izle". Kurye kutuya dokununca kendi sayısı geçerli olur. */
  const [amountDraft, setAmountDraft] = useState<number | null>(null);

  /**
   * Yüklenmiş kanıtlar (11.2). Her biri R2'ye YAZILMIŞ bir anahtar taşır — taslak yok.
   *
   * Çoğul, çünkü kapı çoğulu destekliyor (`alreadyRequested` tavanı) ve saha da öyle: imza + hasarlı
   * kolinin fotoğrafı aynı teslimatta anlamlı. Ama kayda giden TEK kanıt (`DeliveryProofInput`
   * tekil) — ilki yazılır, gerisi bugün yalnız kuryenin gördüğü ek çekimdir.
   * BEKLEYEN(11.2) — çoklu kanıdın kayda geçmesi kapının şeklini değiştirmeyi ister.
   */
  const [proofs, setProofs] = useState<ProofDraft[]>([]);
  const [receivedBy, setReceivedBy] = useState('');

  const onTheWay = view.order.status === 'out_for_delivery';

  // Kuryenin önerdiği hâl: dokunulmamış satır bugünkü karşılananı sürdürür.
  const proposed = useMemo(
    () => view.lines.map((line) => ({ ...line, fulfilledQty: given[line.id] ?? line.fulfilledQty })),
    [view.lines, given],
  );

  const derived = useMemo(
    () => derivePaymentStatusForOrder(view.order, proposed, view.amounts),
    [view.order, proposed, view.amounts],
  );

  const dueCents = derived.amountToCollectCents;
  const amountEuros = amountDraft ?? fromCents(dueCents);

  /** Eylem sonrası güne dönülür: kapıdaki iş bitti, sıradaki durak listede. */
  const run = (action: () => Promise<{ error: string | null }>, backToDay: boolean) => {
    setError(null);
    startTransition(async () => {
      const { error: failed } = await action();
      if (failed) {
        setError(failed);
        return;
      }
      if (backToDay) router.push('/operations/deliveries');
      else router.refresh();
    });
  };

  /**
   * Kanıtı listeden çıkarır ve yerel önizleme adresini serbest bırakır.
   *
   * Yan etki güncelleyicinin İÇİNDE değil: React güncelleyiciyi saf sayar ve geliştirmede iki kez
   * çağırır — adresi orada bırakmak, bir kez fazladan serbest bırakmak demekti.
   *
   * **R2'deki dosya silinmez.** Yüklenmiş ama kullanılmayan bir nesne kalır; silmek için ayrı bir
   * yetki ve ayrı bir kapı gerekir, ve kuryenin "yanlış fotoğraf" demesi silme yetkisi vermez.
   * Anahtar hiçbir kayda girmediği için kimseye görünmez.
   */
  const removeProof = (imageKey: string) => {
    const gone = proofs.find((proof) => proof.imageKey === imageKey);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    setProofs((current) => current.filter((proof) => proof.imageKey !== imageKey));
  };

  const confirm = () => {
    // Yalnız DEĞİŞEN satır gönderilir: dokunulmamış kalemi de yazmak, aynı sayıyı yeniden yazan
    // gereksiz bir düzeltme kaydı doğururdu.
    const adjustments: FulfillmentAdjustment[] = view.lines
      .filter((line) => (given[line.id] ?? line.fulfilledQty) !== line.fulfilledQty)
      .map((line) => ({
        orderItemId: line.id,
        fulfilledQty: given[line.id] ?? line.fulfilledQty,
        // Kapıda mal fiili stoktan HİÇ düşmemiştir (sipariş henüz `delivered` değil) — akıbet
        // seçimi teslim SONRASI iadenin sorusudur, kurye burada onu seçmez.
        returnDisposition: null,
        note: 'Kapıda eksik/reddedilen kalem',
      }));

    const amountCents = toCents(amountEuros);
    // Tahsilat yazılamıyorsa (hesap seçilmemiş) ya da tutar sıfırlanmışsa teslim tahsilatsız kapanır
    // ve borç açık kalır — sessizce sıfır yazmaktan iyisi, hiç yazmamaktır.
    const collection =
      view.doorAccountId && amountCents > 0
        ? { method, amountCents, accountId: view.doorAccountId }
        : null;

    // Kanıt: ilk yüklenen kayda geçer. `receivedBy` boşsa `null` — boş dize yazmak "adı yok" ile
    // "ad girilmedi" arasındaki farkı silerdi.
    const first = proofs[0];
    const proof = first
      ? { kind: first.kind, imageKey: first.imageKey, receivedBy: receivedBy.trim() || null }
      : null;

    run(() => confirmDeliveryAction(view.stop.orderId, { adjustments, collection, proof }), true);
  };

  return (
    <DeliveryStopDesktop
      view={view}
      given={given}
      onGiven={(lineId, qty) => setGiven((current) => ({ ...current, [lineId]: qty }))}
      method={method}
      onMethod={setMethod}
      amountEuros={amountEuros}
      onAmount={(euros) => setAmountDraft(euros)}
      dueCents={dueCents}
      onTheWay={onTheWay}
      busy={busy}
      error={error}
      onStart={() => run(() => startDeliveryAction(view.stop.orderId), false)}
      onConfirm={confirm}
      onUndelivered={(outcome, note) => run(() => markUndeliveredAction(view.stop.orderId, outcome, note), true)}
      proofs={proofs}
      onProof={(proof) => setProofs((current) => [...current, proof])}
      onProofRemove={removeProof}
      receivedBy={receivedBy}
      onReceivedBy={setReceivedBy}
    />
  );
}

/**
 * Açılışta seçili yöntem: siparişte beklenen yöntem kapıda seçilebilenlerden biriyse o, değilse
 * nakit. Online/havale beklenen bir sipariş kapıda para konuşmaz zaten; o durumda seçim de
 * görünmez (borç yoktur), ama bir varsayılan yine de gerekir.
 */
function doorMethodOf(view: DeliveryStopView): DoorMethod {
  const expected = view.stop.payment.expectedMethod;
  return expected === 'card' || expected === 'cheque' ? expected : 'cash';
}
