'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ShortfallSuggestion } from '@lezzet/domain-core';
import { askCustomerAction, confirmPreparationAction, setShipmentAction } from './preparation-actions';
import { PreparationDesktop } from './preparation.desktop';
import { ProblemDialog } from './problem-dialog';
import { ShortfallDialog } from './shortfall-dialog';
import type { PreparationData, PreparationLineView, PreparationOrderView, WarehouseWorkView } from './preparation-types';

/**
 * Hazırlık masasının istemci kökü (10.1–10.3).
 *
 * ── TEK KALEM, TEK YAZIM ────────────────────────────────────────────────────
 * Onay kalem başına gidiyor: depocu bir kalemi toplayınca o kalem yazılır. Toplu onay
 * (*"hepsini hazırladım"*) bilerek yok — bir siparişin altı kalemini tek tuşla onaylamak, fiilen
 * sayılmamış partileri sayılmış gibi kaydetmenin en kolay yoludur.
 *
 * ── EKSİK KARARI ONAYDAN SONRA ──────────────────────────────────────────────
 * Motorun tavsiyesi ancak yazımdan sonra doğuyor (kapı `shortfalls` döndürüyor) ve bu doğru sıra:
 * tavsiye, fiilen kaydedilmiş eksiğe göre verilmeli — kaydedilmeden verilen tavsiye, henüz
 * olmamış bir duruma dair olurdu.
 */
interface PreparationClientProps {
  data: PreparationData;
  /**
   * Tesis şeridinin satırları — kapsam tek depoluysa **boş** ve şerit hiç çizilmez.
   *
   * `data` içinde DEĞİL, ayrı prop: kuyruk verisi tek bir deponun işidir, şerit ise depolar-arası
   * bir bağlam. İkisini aynı nesnede toplamak, kuyruk okumasını kapsamın tamamına bakan bir
   * okumaya çevirirdi (`10.7`'de tam bu ayrım için süzgeçsiz okuma kaldırılmıştı).
   */
  strip: readonly WarehouseWorkView[];
}

export function PreparationClient({ data, strip }: PreparationClientProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(data.orders[0]?.orderId ?? null);
  const [problem, setProblem] = useState<{ order: PreparationOrderView; line: PreparationLineView } | null>(null);
  // `itemId` pencerede TAŞINIYOR: "müşteriye sorulsun" hangi kaleme ait olduğunu bilmek zorunda ve
  // başlık (`title`) bir kimlik değil. `asked` pencerenin kendi hâli — soru düştükten sonra düğme
  // yerine sonucu çizer (aynı soruyu ikinci kez sordurmamanın ekran tarafı).
  const [shortfall, setShortfall] = useState<{
    title: string;
    itemId: string;
    suggestion: ShortfallSuggestion;
    asked: boolean;
  } | null>(null);
  /** Soru gönderimi kendi beklemesini taşır (künyesi `askCustomer`da) — `isPending` onu kapsamıyor. */
  const [asking, setAsking] = useState(false);

  /**
   * Kalemi yazar. `batches` verilmezse SİSTEM ÖNERİSİ gider — "Hazırlandı" tuşunun anlamı tam
   * olarak budur: öneriye dokunmadım, olduğu gibi topladım.
   */
  const confirm = (order: PreparationOrderView, line: PreparationLineView, batches?: { stockId: string; qty: number }[]) => {
    const picks = [
      {
        orderItemId: line.itemId,
        batches: batches ?? line.suggestion.map((batch) => ({ stockId: batch.stockId, qty: batch.qty })),
      },
    ];

    setError(null);
    startTransition(async () => {
      const { data: result, error: failed } = await confirmPreparationAction(order.orderId, picks);
      if (failed || !result) {
        setError(failed ?? 'Kalem kaydedilemedi.');
        return;
      }

      setProblem(null);
      // Eksik varsa kararı SOR — sessizce geçmek, depocunun vermesi gereken kararı sistemin
      // yerine vermesi olurdu. Kapı tavsiyeyi dönüyor, karar burada soruluyor.
      const eksik = result.shortfalls.find((row) => row.itemId === line.itemId);
      if (eksik) {
        setShortfall({
          title: line.title,
          itemId: line.itemId,
          suggestion: eksik.suggestion as ShortfallSuggestion,
          asked: false,
        });
      }

      router.refresh();
    });
  };

  /**
   * **"Müşteriye sorulsun"** (10.3) — soru talepler kuyruğuna düşer, sipariş olduğu yerde kalır.
   *
   * Pencere KAPANMIYOR: depocu bastığı düğmenin ne yaptığını görmeli. Kapanan bir pencere, soru
   * gerçekten düştü mü sorusunu cevapsız bırakır ve tereddüt eden operatör ikinci kez basar.
   */
  /**
   * **Soruyu gönder — KENDİ bekleme bayrağıyla, `startTransition`ın içinde değil.**
   *
   * Ölçüm turunda görüldü (25.08): soru veritabanına düştüğü hâlde pencere iki saniyeden uzun süre
   * eski hâlinde kaldı. Sebep `router.refresh()`: transition sunucu turu bitene kadar "pending"
   * kalıyor ve içindeki HER state güncellemesi onunla birlikte erteleniyor — yani "soruldu"
   * cevabı, kuyruğun yeniden okunmasını bekliyordu. Depocu bastığı düğmeden cevap alamayınca
   * ikinci kez basar.
   *
   * Şimdi sonuç anında yazılıyor, tazeleme arkada sürüyor. Kendi bayrağı var çünkü `isPending`
   * artık bu isteği kapsamıyor: bayraksız bırakılsaydı düğme istek sürerken basılabilir kalırdı.
   */
  const askCustomer = async (itemId: string) => {
    setError(null);
    setAsking(true);
    try {
      const { error: failed } = await askCustomerAction(itemId);
      if (failed) {
        setError(failed);
        return;
      }
      setShortfall((cur) => (cur ? { ...cur, asked: true } : cur));
      startTransition(() => router.refresh());
    } finally {
      setAsking(false);
    }
  };

  /** Kargo künyesini yazar (10.9) — kalem yazımından bağımsız, kendi tek turu. */
  const saveShipment = (order: PreparationOrderView, carrier: string, trackingNumber: string) => {
    setError(null);
    startTransition(async () => {
      const { error: failed } = await setShipmentAction(order.orderId, carrier, trackingNumber);
      if (failed) {
        setError(failed);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <PreparationDesktop
        data={data}
        strip={strip}
        selectedId={selectedId}
        onSelect={setSelectedId}
        busy={busy}
        error={error}
        onConfirmLine={(order, line) => confirm(order, line)}
        onProblem={(order, line) => {
          setError(null);
          setProblem({ order, line });
        }}
        onShipment={saveShipment}
      />

      {problem ? (
        <ProblemDialog
          key={problem.line.itemId}
          order={problem.order}
          line={problem.line}
          busy={busy}
          error={error}
          onClose={() => setProblem(null)}
          onConfirm={(batches) => confirm(problem.order, problem.line, batches)}
        />
      ) : null}

      {shortfall ? (
        <ShortfallDialog
          title={shortfall.title}
          suggestion={shortfall.suggestion}
          busy={busy || asking}
          asked={shortfall.asked}
          // Hata PENCEREDE gösteriliyor (ölçüm turu 25.08): kapı reddederse ("zaten açık bir soru
          // var") cümle sayfanın altında kalırdı ve operatör pencereye bakıyor — `ProblemDialog`
          // aynı kararı zaten vermişti.
          error={error}
          onClose={() => setShortfall(null)}
          // "Kalanı gönder" AYRI BİR YAZIM DEĞİL: eksik zaten kaydedildi (kalem toplanan adetle
          // yazıldı) ve siparişin geri kalanı normal akışında sürüyor. Burada yapılacak tek şey
          // kararı kapatmak — ikinci bir yazım aynı eksiği iki kez kaydetmek olurdu.
          onShipRest={() => setShortfall(null)}
          onAskCustomer={() => askCustomer(shortfall.itemId)}
        />
      ) : null}
    </>
  );
}
