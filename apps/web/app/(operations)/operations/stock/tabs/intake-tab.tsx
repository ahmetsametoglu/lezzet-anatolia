'use client';

import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { SectionHead } from '@/components/operation/ui/section-head';
import { Table, type Column } from '@/components/operation/ui/table';
import { money, num, shortDate, shortDateTime } from '@/components/operation/ui/format';
import type { PendingPurchase, ReceivedIntake, StockViewProps } from '../stock-types';

/**
 * **MAL KABUL SEKMESİ — depoya giren** (22.26). Eskiden `/operations/receiving` ayrı bir sayfaydı.
 *
 * ── SEKME LİSTE, KARAR DİYALOGDA ────────────────────────────────────────────
 * Sekme "ne bekliyorum"u gösterir; sayım ve kayıt liste ÜSTÜNDE açılan formda yapılır — bu ekranın
 * kendi deseni (teklif diyaloğu, lot sorgusu) ve tasarımın kuralı: *"kararlar liste üstünde açılan
 * formlarda verilir"*. Eski sayfa formu sağ sütunda kalıcı tutuyordu ve liste ile form sürekli
 * birbirinin yerini daraltıyordu.
 *
 * ── LİSTE DEPO-ÜSTÜ, KABUL DEĞİL ────────────────────────────────────────────
 * Tedarik siparişi bir depoya ait değildir; mal kabul edilirken bir kapıdan girer. Bu yüzden liste
 * bağlamla daralmaz ama kabul diyaloğu depoyu SORAR ve varsayılan üretmez (`CLAUDE §1`).
 *
 * ── İKİ BÖLÜM: BEKLEYENLER + KABUL EDİLENLER (22.28) ────────────────────────
 * Sekme iki soruyu birden cevaplar: *"ne bekliyorum"* ve *"ne geldi"*. İkincisi 22.26'da açık
 * kalmıştı ve eksikliği sessizdi — depocu az önce yazdığı kaydı bir daha göremiyordu. Göremeyen
 * operatör tereddüt ettiğinde aynı malı ikinci kez girer; defter bu yüzden bir konfor değil,
 * çift kaydın önündeki tek engel.
 *
 * **Bekleyenler ERİR, defter UZAR** — ve sayfalama ölçütü tam olarak bu (`CLAUDE §1`): açık sipariş
 * kümesi kabul edildikçe kapanır, tek turda gelir; giriş kaydı hiç erimez, keyset'le ilerler.
 */
export function IntakeTab({
  data,
  onOpenIntake,
  received,
  hasMoreReceived,
  loadingReceived,
  onLoadMoreReceived,
}: StockViewProps) {
  const intake = data.intake;
  // Sekme verisi yalnız sekme açıkken okunuyor; `null` sunucu turu daha bitmediyse olur.
  if (!intake) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-ops-line px-6 py-2.5">
        <span className="font-ops-body text-ops-sm text-ops-muted">
          Sipariş seçip sayıma başlayın; irsaliyesiz gelen mal için boş form açın.
        </span>
        <Button variant="secondary" size="sm" onClick={() => onOpenIntake(null)}>
          + Boş formla kabul
        </Button>
      </div>

      {/* Bekleyenler ÜSTTE ve kendi yüksekliğiyle sınırlı: bugünün işi budur ve defter onu aşağı
          itmemeli. Tavan yerine `max-h` — üç sipariş varken boş yer bırakmak, listeyi olduğundan
          uzun göstermek olurdu. */}
      <div className="flex max-h-[45%] min-h-0 shrink-0 flex-col">
        <SectionHead
          title="Kabul bekliyor"
          hint={
            intake.pending.length === 0
              ? 'açık siparişlerin tamamı karşılandı'
              : `${num(intake.pending.length)} sipariş · en eskisi başta`
          }
        />
        {intake.pending.length === 0 ? (
          <EmptyState
            title="Kabul bekleyen sipariş yok"
            description="Açık tedarik siparişlerinin tamamı karşılandı. İrsaliyesiz gelen mal için “Boş formla kabul” ile giriş yapabilirsiniz."
          />
        ) : (
          <ul className="flex min-h-0 flex-col overflow-y-auto">
            {intake.pending.map((purchase) => (
              <li key={purchase.purchaseOrderId}>
                <PendingRow purchase={purchase} onOpen={() => onOpenIntake(purchase.purchaseOrderId)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReceivedSection
        rows={received}
        hasMore={hasMoreReceived}
        loading={loadingReceived}
        onLoadMore={onLoadMoreReceived}
      />
    </div>
  );
}

/**
 * **Kabul edilenler defteri** — en yeni önce.
 *
 * ── SIRA KAYIT ANINDAN, İRSALİYE TARİHİNDEN DEĞİL ───────────────────────────
 * İki tarih var ve ikisi de doğru: `date` malın geldiği gün (geriye dönük girilebilir), `createdAt`
 * kaydın yazıldığı an. Defterin sırası ikincisi — "az önce ne girdim" sorusunu yalnız o cevaplar.
 * Satır ikisini de gösterir ve saat yalnız FARKLIYSA ayrıca yazılır: aynı gün girilen kayda iki
 * tarih basmak, olmayan bir ayrımı varmış gibi okuturdu.
 *
 * ── PARA SÜTUNU SUNUCUDAN GELDİYSE VAR ──────────────────────────────────────
 * `totalAmountCents === null` "gösterilmiyor" demek, sıfır değil. Depoya bağlı personelde sunucu
 * alanı hiç doldurmaz; kolon o zaman hiç çizilmez — boş bir "Tutar" başlığı, gizlenen bir şey
 * olduğunu söyler ve depocuya kendisinden saklanan bir sayıyı hatırlatırdı.
 */
function ReceivedSection({
  rows,
  hasMore,
  loading,
  onLoadMore,
}: {
  rows: ReceivedIntake[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const showsCost = rows.some((row) => row.totalAmountCents !== null);

  const columns: Column<ReceivedIntake>[] = [
    {
      key: 'when',
      header: 'Giriş',
      width: 'minmax(120px,0.8fr)',
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="font-ops-mono text-ops-sm font-medium text-ops-ink">{shortDate(row.date)}</span>
          {/* Kaydın anı yalnız irsaliye gününden FARKLIYSA: geriye dönük yazılmış bir kabul burada
              görünür olmalı, aynı gün girilmiş olan ise gürültü yapmamalı. */}
          {row.createdAt.slice(0, 10) === row.date ? null : (
            <span className="font-ops-body text-ops-xs text-ops-faint" title="Kaydın yazıldığı an">
              kayıt: {shortDateTime(row.createdAt)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Kaynak',
      width: 'minmax(180px,1.4fr)',
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">
            {row.supplierName ?? 'Tedarikçisiz giriş'}
          </span>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">
            {row.purchaseRef ? (
              <span className="font-ops-mono">{row.purchaseRef}</span>
            ) : (
              // Siparişsiz kabul bir eksiklik DEĞİL, ayrı bir yoldur (dökme/plansız alım) — ve
              // öyle söylenir; boş bırakmak "numarası kayıp" gibi okunurdu.
              'siparişsiz kabul'
            )}
            {row.warehouseName ? ` · ${row.warehouseName}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'lines',
      header: 'Kalem',
      width: '76px',
      align: 'right',
      cell: (row) => <span className="font-ops-mono text-ops-sm text-ops-body">{num(row.lineCount)}</span>,
    },
    {
      key: 'qty',
      header: 'Paket',
      width: '84px',
      align: 'right',
      cell: (row) => (
        <span className="font-ops-mono text-ops-sm font-medium text-ops-ink" title="Giriş anındaki adet — bugünkü stok değil">
          +{num(row.qty)}
        </span>
      ),
    },
    ...(showsCost
      ? [
          {
            key: 'total',
            header: 'Tutar',
            width: '96px',
            align: 'right' as const,
            cell: (row: ReceivedIntake) => (
              <span className="font-ops-mono text-ops-sm text-ops-body">
                {row.totalAmountCents === null ? '—' : money(row.totalAmountCents)}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'note',
      header: 'Not',
      width: 'minmax(100px,1fr)',
      // `block` şart: `truncate` (overflow+ellipsis+nowrap) satır içi bir öğede kesmez, TAŞAR —
      // uzun not tablonun sağ kenarından dışarı akıyordu (ekran turunda görüldü). Tam metin
      // `title`da: kesilen bir not, okunamayan bir not olmamalı.
      cell: (row) => (
        <span className="block truncate font-ops-body text-ops-xs text-ops-muted" title={row.note ?? undefined}>
          {row.note ?? ''}
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-ops-line">
      <SectionHead title="Kabul edilenler" hint="en yeni önce · giriş anındaki adet" />
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          <EmptyState
            title="Henüz kabul kaydı yok"
            description="Bir siparişi kabul ettiğinizde ya da boş formla giriş yaptığınızda kayıt bu listede görünür."
          />
        }
        footer={<LoadMoreSentinel hasMore={hasMore} loading={loading} onLoadMore={onLoadMore} />}
      />
    </div>
  );
}

/**
 * Bekleyen sipariş kartı — numara, tedarikçi, kaç kalem, kaç gündür bekliyor.
 *
 * **Yaş bir UYARIDIR, hata değil:** 14 gündür bekleyen sipariş kaybolmuş olabilir de, tedarikçinin
 * teslim takvimi öyle de olabilir. Ekran işaretler, karar operatörün (`DOMAIN §4`).
 */
function PendingRow({ purchase, onOpen }: { purchase: PendingPurchase; onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ops-line-soft px-6 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">
            {purchase.referenceNo ?? 'Numarasız sipariş'}
          </span>
          {purchase.isPartial ? <Badge tone="amber">kısmen geldi</Badge> : null}
          {/* Yaş eşiği: bir haftayı geçen bekleyiş görünür olmalı. Değer parametrik değil çünkü bir
              ayar değil, okumanın kendisi — operatör sayıyı görüp kendi kararını veriyor. */}
          {purchase.ageDays !== null && purchase.ageDays >= 7 ? (
            <Badge tone="red">{num(purchase.ageDays)} gündür bekliyor</Badge>
          ) : null}
        </div>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">
          {purchase.supplierName} · {num(purchase.missingLineCount)} kalem bekliyor
          {purchase.ageDays === null ? ' · henüz gönderilmedi' : ''}
        </span>
      </div>
      <Button variant="secondary" size="sm" onClick={onOpen}>
        Kabul et
      </Button>
    </div>
  );
}
