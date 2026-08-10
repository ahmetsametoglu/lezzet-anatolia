'use client';

import { PageHeader } from '@/components/operation/ui/page-header';
import { SegmentedNav } from '@/components/operation/ui/segmented-nav';
import { agoLabel, num } from '@/components/operation/ui/format';
import { ProposalCard } from './assistant-card';
import { cardBodyOf } from './assistant-card-bodies';
import { ProposalDialog, QueueEmpty } from './assistant-sections';
import { QUEUE_TABS, QUEUE_TAB_LABELS } from './assistant-url';
import type { AssistantViewProps } from './assistant-types';

/**
 * Asistan Onay Kuyruğu — web (22.3). `Operasyon - Asistan Kuyrugu.dc.html`.
 *
 * İKİ SÜTUN, TEK EKRAN: kuyruk · karar çerçevesi. Kuyruğu ayrı bir sayfaya koymak operatörü her
 * karardan sonra listeye geri döndürürdü; öneriler arka arkaya işlenen bir iştir.
 *
 * **Çerçeve her tipte AYNI, değişen tek şey önizleme bloğu** (brief §2): kuyruktaki kalemler
 * birbirine benzemez (altı kalemlik bir paket ↔ tek satırlık bir para hareketi) ama öğrenilecek
 * ekran tek olmalı.
 *
 * Mobil YOK — operasyon yüzeyi yalnız masaüstü (`CLAUDE §2`).
 *
 * Sekmeler `ui/tabs` ile: çizim onları başlık barının içinde bir segment hapı olarak veriyor, bizde
 * "bir ekranın alt görünümleri" deseni alt-çizgili sekme barıdır (Ürünler · Para · Raporlar aynı
 * dili konuşuyor). Bilinçli sapma — `design/KARARLAR.md`.
 */
export function AssistantDesktop({
  data,
  urlState,
  navPending,
  busy,
  error,
  onTab,
  onSelect,
  onDecision,
}: AssistantViewProps) {
  // Yaş aralığı YALNIZ bekleyen sekmesinde söylenir: arşivin en eskisi bir bilgi değil, bekleyen
  // işin en eskisi bir uyarıdır ("unutulmasın" — kuyruğun sıralama gerekçesi).
  // Kuyruk ESKİDEN YENİYE sıralı (kısmi indeks `created_at` artan): en eskisi ilk, en yenisi son.
  const pendingRows = urlState.tab === 'pending' ? data.rows : [];
  const oldest = pendingRows[0];
  const newest = pendingRows.length > 1 ? pendingRows[pendingRows.length - 1] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      {/* Sekmeler ORTAK BAŞLIĞIN İÇİNDE — çizim onları başlık barının sağına, gri rayın üstünde
          kayan bir hap olarak koyuyor. Bir tur `ui/tabs` ile başlığın ALTINA ayrı bir bant olarak
          yazılmıştı (kullanıcı düzeltmesi 09.08): ayrı bant hem çizimden sapma hem de bu ekranda
          bedeli olan bir sapmaydı — iki sütun zaten ekranı dolduruyor, karar çerçevesi o yüksekliği
          kaybediyordu. Sayaç da rozete değil ALT SATIRA döndü, çizimdeki yerine. */}
      <PageHeader
        title="Asistan Onay Kuyruğu"
        // Çizimin alt satırı: sayı + yaş aralığı ("7 bekleyen öneri · en eski 1 gün önce · en
        // yenisi yarım saat önce"). Aralık kuyruğun HÂLİNİ söylüyor: hepsi bu sabah geldiyse başka,
        // en eskisi bir haftalıksa başka bir ekran.
        subtitle={
          data.pendingCount === 0
            ? 'Bekleyen öneri yok — asistan hazırlar, kararı siz verirsiniz.'
            : [
                `${num(data.pendingCount)} bekleyen öneri`,
                oldest ? `en eski ${agoLabel(oldest.ageMinutes)}` : null,
                newest ? `en yenisi ${agoLabel(newest.ageMinutes)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
        }
      >
        <SegmentedNav
          label="Kuyruk görünümü"
          items={QUEUE_TABS.map((key) => ({ key, label: QUEUE_TAB_LABELS[key] }))}
          active={urlState.tab}
          onSelect={onTab}
        />
      </PageHeader>

      {/* ── IZGARA (kullanıcı kararı 10.08) ─────────────────────────────────────
          Bir tur burada iki sütun vardı: 326 piksellik kuyruk listesi + karar panosu. Izgara ikisini
          de düzeltiyor — öneriler yan yana görünüyor (hangisi önce, hangisi bekleyebilir) ve karar
          kendi penceresinde tam alan buluyor. Kuyruk artık bir liste değil bir MASA.

          Sütun sayısı ekrana göre değil KART GENİŞLİĞİNE göre: `auto-fill` + `minmax` ile kart
          17,5rem (280 px) altına düşmüyor, sığdığı kadarı yan yana diziliyor. Sabit sütun sayısı
          yazsaydık geniş ekranda kartlar gereksiz uzar, dar panoda ezilirdi.

          **Ölçü kullanıcının verdiği hedeften çıktı** (10.08: *"1280 piksele dört-beş kart sığsın,
          kartlar dikey dikdörtgen olsun"*): 1280'de sayfa dolgusu düşünce 1232 kalıyor,
          `(1232+14)/(280+14) = 4` kart. Alt sınır 20rem'ken 3 sığıyordu ve kartlar yatay dikdörtgene
          kaçıyordu. Kartın boyu `min-h` ile tutuluyor (`assistant-card`), yani biçim dikey kalıyor.

          **KARTLAR EŞİT BOYDA** (`auto-rows-fr` + varsayılan `stretch`, kullanıcı kararı 10.08).
          Bir tur `items-start` yazılıydı ve gerekçesi "kısa kartlar boşluk taşımasın"dı — ölçüm bunu
          çürüttü: fırsat kartı ürün görseliyle 490 piksele çıkıyor, tarif kartı 384'te kalıyor ve
          ızgara kırık bir tarağa dönüyor. Izgaranın tek gerekçesi tarama; hizasız bir taban gözü
          her kartta yeniden ayarlamaya zorluyor, yani tam da o yeteneği götürüyor.
          `auto-rows-fr` satırlar ARASINDA da eşitliyor: yalnız `stretch` verilseydi ilk satır
          kendi en uzununa, ikinci satır kendi en uzununa hizalanır ve ızgara satır satır kayardı.
          Artan boşluk sorun değil — durum satırı `mt-auto` ile dibe yaslı, yani kart dolu duruyor. */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-ops-card px-6 py-5" aria-busy={navPending || undefined}>
        {/* KARARIN SONUCU IZGARANIN ÜSTÜNDE, kartın içinde değil (10.08). Karar verilen öneri
            kuyruktan düşer ve diyalog kapanır — cümle karta yazılsaydı o an başka bir önerinin
            kartında görünürdü, yani yanlış satırın altında. Üstte durunca hangi öneriye ait olduğu
            değil NE OLDUĞU okunuyor ve o yeter ("Teklif açıldı", "Motor reddetti: …"). */}
        {error ? (
          <div
            role="status"
            className="mb-3.5 rounded-ops-card border border-ops-line border-l-[3px] border-l-ops-olive bg-ops-subtle px-3.5 py-2.5 font-ops-body text-ops-base text-ops-strong"
          >
            {error}
          </div>
        ) : null}

        {data.rows.length === 0 ? (
          <QueueEmpty tab={urlState.tab} />
        ) : (
          <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3.5">
            {data.rows.map((row) => (
              <ProposalCard key={row.id} row={row} onOpen={onSelect}>
                {cardBodyOf(row)}
              </ProposalCard>
            ))}
          </div>
        )}
      </div>

      {/* Diyalog seçili öneriyle açılır; seçim adreste (`?p=`) durduğu için bağlantısı paylaşılabilir.
          `key` ile sarılı: öneri değişince iç durum (taslak, açık teknik döküm) sıfırlanır — bir
          önerinin ham dilekçesi açıkken ötekine geçmek, başka bir kaydın JSON'unu aynı yerde
          gösterirdi. */}
      {data.selected ? (
        <ProposalDialog
          key={data.selected.id}
          row={data.selected}
          options={data.options}
          busy={busy}
          error={error}
          onClose={() => onSelect('')}
          onDecision={onDecision}
        />
      ) : null}
    </div>
  );
}
