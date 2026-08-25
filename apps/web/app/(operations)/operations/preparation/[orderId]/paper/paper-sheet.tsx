'use client';

import Link from 'next/link';
import type { PreparationOrder } from '@lezzet/application';
import { Button } from '@/components/operation/ui/button';
import { num, shortDate } from '@/components/operation/ui/format';
import { PREP_PATH } from '../../preparation-labels';

/**
 * **Hazırlık kâğıdı = İŞ EMRİ** — `design/project/Belge - Hazirlik Kagidi.dc.html` (A4 / 14 mm),
 * kullanıcı kararı 25.08 ile rolü değişti.
 *
 * ── KÂĞIT ARTIK DOLDURULMUYOR, OKUTULUYOR ───────────────────────────────────
 * İlk hâlinde elle işaretlenen iki sütun vardı (*"Kondu / eksik"*, *"Not"*) ve o sütunlar bugün
 * ÖLÜ: toplama telefonda yapılıyor (mobil D1 · kutu döngüsü 23.6), depocu kâğıda kalem
 * değdirmiyor. Sebep tarihseldi — tasarım 08.08'de yazıldı, kutu döngüsü yirmi gün sonra geldi ve
 * işi telefona taşıdı; tasarım güncellenmedi. Elle doldurma alanları kaldırıldı: doldurulmayacak
 * bir boşluk, kâğıdı okuyan kişiye yapılmamış bir iş varmış gibi görünür.
 *
 * ── KÂĞIDIN GERÇEK İŞİ: FİZİKSEL KUYRUK ─────────────────────────────────────
 * Masada duran kâğıt = yapılacak iş; alınan kâğıt = üstlenilmiş iş. İki depocu aynı siparişi
 * toplamaz ve "bugün ne var" sorusu bakışta cevaplanır — yazılımın kuyruğu bunu ancak ekran
 * açılınca söyler. QR o kâğıdı telefona bağlar: okut → sipariş açılır → toplama telefonda sürer.
 *
 * ── SIRA EKRANIN SIRASI ─────────────────────────────────────────────────────
 * Kalemler kapının verdiği sırayla basılıyor (yürüyüş sırası — `storage_area.sort_order`). Kâğıt
 * kendi sırasını kursaydı, aynı depoyu iki farklı yönde yürüten iki liste doğardı.
 *
 * ── YAZDIRMA KENDİLİĞİNDEN AÇILMAZ ──────────────────────────────────────────
 * Operatör önce kâğıdı görmeli: doğru siparişi bastığını doğrulamadan onay isteyen bir pencere,
 * yanlış listeyi eline alma ihtimalini artırır.
 *
 * ── PARA YOK, ADRES YOK ─────────────────────────────────────────────────────
 * Kapı zaten taşımıyor (`PreparationOrder` künyesi). Belgenin altbilgisi bunu kâğıdın üstüne de
 * yazıyor — eline alan kişi ne olduğunu bilsin.
 */
interface PaperSheetProps {
  order: PreparationOrder;
  warehouseName: string;
  /** Siparişin QR'ı (referans numarası); `null` = referanssız sipariş, okutacak bir şey yok. */
  qr: { path: string; moduleCount: number } | null;
}

export function PaperSheet({ order, warehouseName, qr }: PaperSheetProps) {
  const sealed = order.boxes.filter((box) => box.sealedAt !== null).length;

  return (
    <div data-doc="paper" className="min-h-screen bg-ops-white">
      {/* Kabuk yalnız EKRANDA: kâğıda basılmıyor (`data-print="hide"`). */}
      <div
        data-print="hide"
        className="flex items-center justify-between gap-3 border-b border-ops-line px-6 py-3"
      >
        <Link
          href={PREP_PATH}
          className="cursor-pointer font-ops-body text-ops-sm text-ops-muted underline-offset-2 hover:underline"
        >
          ← Kuyruğa dön
        </Link>
        <Button variant="primary" size="sm" onClick={() => window.print()}>
          Yazdır
        </Button>
      </div>

      <article className="mx-auto max-w-[182mm] px-[14mm] py-[12mm] print:px-0 print:py-0">
        <header className="flex items-start justify-between gap-6 border-b border-ops-line pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">
              Hazırlık kâğıdı
            </span>
            {/* Tasarım 27px veriyor; merdivende karşılığı `display` (29px) — ham piksel yazılmaz
                (`docs:check` zorluyor) ve iki basamak arasında kalan bir değer için yeni basamak
                açmak, merdiveni belge başına bir kademe uzatmak olurdu. */}
            <h1 className="font-ops-display text-ops-display font-semibold leading-tight tracking-tight text-ops-ink">
              {order.referenceNo ?? 'Numarasız sipariş'}
            </h1>
            <span className="font-ops-body text-ops-xs text-ops-muted">
              {[
                // Koliye yazılacak ad ADRESTEN gelir ve yalnız farklıysa ayrıca yazılır (10.9
                // kararı) — kâğıt da aynı adı taşımalı, etiketi yazan kişi buna bakıyor.
                order.recipientName && order.recipientName !== order.customerName
                  ? `${order.customerName} · koliye: ${order.recipientName}`
                  : order.customerName,
                warehouseName,
                order.deliveryDate ? `${shortDate(order.deliveryDate)} teslim` : 'kargo — teslim günü yok',
              ].join(' · ')}
            </span>
          </div>
          {/* QR SAĞ ÜSTTE ve İRİ: kâğıdın ilk işi okutulmak. Kenarda küçük bir işaret olsaydı
              depocu onu aramak zorunda kalır, eldivenli elle kâğıdı çevirirdi. */}
          <div className="flex shrink-0 flex-col items-center gap-1">
            {qr ? (
              <svg
                viewBox={`0 0 ${qr.moduleCount} ${qr.moduleCount}`}
                className="h-[26mm] w-[26mm]"
                shapeRendering="crispEdges"
                aria-label={`${order.referenceNo} karekodu`}
              >
                {/* Beyaz zemin AÇIKÇA çiziliyor: kâğıt beyaz ama okuyucu sessiz bölgeyi (quiet
                    zone) matrisin dışında arar — zeminsiz bir QR, koyu bir yüzeye basılırsa
                    okunmaz olur. */}
                <rect width={qr.moduleCount} height={qr.moduleCount} fill="#ffffff" />
                <path d={qr.path} fill="#000000" />
              </svg>
            ) : null}
            <span className="font-ops-body text-ops-micro text-ops-faint">Depoda kalır</span>
          </div>
        </header>

        <div className="flex gap-8 border-b border-ops-line py-3">
          <Stat label="Kalem" value={num(order.lineCount)} />
          <Stat label="Kutu" value={order.boxes.length === 0 ? '—' : `${num(order.boxes.length)} (${num(sealed)} kapalı)`} />
          {/* Basım anı İSTEMCİDE okunuyor ve bu doğru: kâğıdın üstündeki saat, kâğıdın basıldığı
              andır. Sunucuda üretilseydi önbelleğe alınmış bir sayfa eski saati taşırdı. */}
          <Stat label="Basım" value={new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} />
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-ops-line">
              {['Ürün', 'Adet', 'Konum', 'Bu partiden al · son tarih'].map((header) => (
                <th
                  key={header}
                  className="py-2 pr-3 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => {
              const remaining = Math.max(0, line.orderedQty - line.pickedQty);
              return (
                <tr key={line.itemId} className="border-b border-ops-line-soft align-top">
                  <td className="py-2.5 pr-3 font-ops-body text-ops-sm font-medium text-ops-ink">
                    {line.productName}
                    {line.variantLabel ? <span className="text-ops-muted"> · {line.variantLabel}</span> : null}
                  </td>
                  <td className="py-2.5 pr-3 font-ops-mono text-ops-sm text-ops-ink">
                    {num(remaining)}
                    {/* Yarım kalan iş kâğıtta da görünür: "6 iste, 2 zaten toplandı" diyen bir
                        satır, kalan 4'ü ikinci kez toplatmaz. */}
                    {line.pickedQty > 0 ? (
                      <span className="font-ops-body text-ops-micro text-ops-muted"> ({num(line.pickedQty)} toplandı)</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 font-ops-body text-ops-xs text-ops-body">
                    {line.suggestion[0]?.areaName ?? '—'}
                  </td>
                  <td className="py-2.5 pr-3 font-ops-body text-ops-xs text-ops-body">
                    {line.suggestion.length === 0 ? (
                      // Boşluğun İKİ anlamı var ve ayrılıyor (10.1'in ekran tarafındaki aynı
                      // düzeltmesi): bitmiş iş ↔ uygun parti yok.
                      <span className="text-ops-faint">{remaining === 0 ? 'toplandı' : 'uygun parti yok'}</span>
                    ) : (
                      line.suggestion.map((batch, index) => (
                        <span key={batch.stockId} className="block">
                          {num(batch.qty)} adet · son tarih {shortDate(batch.expiryDate)}
                          {index === 0 && line.suggestion.length > 1 ? ' (önce bu)' : ''}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="mt-3 font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
          Sıra ekrandaki sırayla aynıdır — kâğıt ile ekran karşılaştırılmaz. Parti önerisi tazelik kuralına göre
          verilir: <strong className="font-medium text-ops-body">en yakın tarihli önce çıkar</strong>.
        </p>

        {/* KÂĞIDIN KULLANMA TALİMATI — bir cümle, en görünür yerde. Kâğıt artık doldurulmuyor ve
            bunu söylemeyen bir belge, alışkanlıktan kalem arayan depocuya doldurulacakmış gibi
            görünür. Adım sırası da burada: al → okut → topla. */}
        <ol className="mt-6 flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-subtle px-4 py-3.5">
          {[
            ['Bu kâğıdı alın', 'aldığınız iş sizindir — aynı siparişi kimse ikinci kez toplamaz.'],
            ['Karekodu telefonla okutun', 'sipariş telefonda açılır.'],
            ['Toplamayı telefondan yürütün', 'kutu, eksik ve not oraya yazılır — kâğıda işaret koymanız gerekmez.'],
          ].map(([baslik, aciklama], index) => (
            <li key={baslik} className="flex items-baseline gap-2.5">
              {/* Numara SABİT genişlikte: üç satırın metni aynı hizadan başlasın, göz kaymasın. */}
              <span className="w-[14px] shrink-0 font-ops-mono text-ops-sm font-semibold text-ops-ink">
                {index + 1}
              </span>
              <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-body">
                <strong className="font-semibold text-ops-ink">{baslik}</strong> — {aciklama}
              </span>
            </li>
          ))}
        </ol>

        <footer className="mt-8 flex items-center justify-between gap-4 border-t border-ops-line pt-3">
          <span className="font-ops-body text-ops-micro text-ops-faint">
            {/* Depo adı ZATEN "… — ana depo" gibi okunuyor; ardına "deposu" eklemek ekranda
                "ana depo deposu" yazdırdı (çekimde görüldü). Ad olduğu gibi basılır. */}
            {[order.referenceNo, warehouseName, order.boxes.length > 0 ? `${num(order.boxes.length)} kutu` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="font-ops-body text-ops-micro text-ops-faint">
            İç belge · fiyat bilgisi içermez · kutuya konmaz
          </span>
        </footer>
      </article>
    </div>
  );
}

/** Başlık altındaki üçlü künye — etiket üstte küçük, sayı altta iri (tasarımın kendi düzeni). */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
        {label}
      </span>
      <span className="font-ops-mono text-ops-sm font-medium text-ops-ink">{value}</span>
    </span>
  );
}
