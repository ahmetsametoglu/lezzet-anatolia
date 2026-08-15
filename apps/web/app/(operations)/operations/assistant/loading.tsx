import { LoadingRegion } from '@/components/loading-region';
import { PageHeader } from '@/components/operation/ui/page-header';
import {
  Skeleton,
  SkeletonFilterBar,
  SkeletonLine,
  SkeletonSegmentedNav,
  SkeletonText,
} from '@/components/operation/ui/skeleton';
import { QUEUE_TABS, QUEUE_TAB_LABELS } from './assistant-url';

/**
 * Asistan kuyruğunun ROTA DÜZEYİ beklemesi (09.2 dersi): bu dosya olmadan raydan bu ekrana geçmek
 * tarayıcıda ESKİ sayfayı bırakır ve operatör tıklamanın işlediğini anlamaz.
 *
 * Başlık GERÇEK `PageHeader` (15.08, emsal: fiyatlar — statik kimlik çubuklaştırılmaz; kabuk
 * blokları `OpsShellProvider`'dan). Alt satır VERİDİR (bekleyen sayısı + yaş aralığı) — çubuk kalır.
 *
 * ── İSKELET BİR TUR YANLIŞ EKRANI ÇİZİYORDU (kullanıcı bildirimi 15.08) ─────
 * Burada 326 piksellik bir kuyruk sütunu + geniş bir karar panosu vardı ve o yerleşim ekranda
 * ARTIK YOK: kuyruk 10.08'de kart ızgarasına döndü (`assistant-card` künyesi), iskelet o taşınmayı
 * kaçırdı. Sonuç iskeletin tek işinin tam tersiydi — *"kartlar değil de garip bir sayfanın content
 * kısmında bir şey var; card view şeklinde olmalı"*: bekleyen ekran iki sütun çiziyor, içerik
 * gelince sayfa baştan diziliyordu. İskelet gelecek içeriğin ŞEKLİNİ söylemiyorsa "yükleniyor"
 * yazmaktan daha kötüdür; yanlış bir şekil vaat eder.
 *
 * Artık gerçek yerleşim: başlık + görünüm hapı · tip süzgeci şeridi · KART IZGARASI.
 */
export default function Loading() {
  return (
    <LoadingRegion className="flex min-h-0 flex-1 flex-col bg-ops-card" label="Asistan kuyruğu yükleniyor">
      <PageHeader title="Asistan Onay Kuyruğu" subtitle={<SkeletonLine className="w-64" />}>
        <SkeletonSegmentedNav labels={QUEUE_TABS.map((tab) => QUEUE_TAB_LABELS[tab])} />
      </PageHeader>

      {/* Süzgeç şeridi HER BEKLEMEDE çizilir, gerçek şerit ise yalnız kuyrukta birden çok tip varken.
          Bilinçli: kuyruk neredeyse her zaman karışık geliyor (asistan tek tipten öneri üretmiyor),
          yani çizmemek yaygın hâlde ızgaranın bir bant aşağı kaymasına yol açardı. Ters hâlde —
          tek tipli ya da boş kuyruk — şerit kaybolur ve ızgara yukarı toplanır; nadir olanı seçtik. */}
      <SkeletonFilterBar label="Tip" count={5} />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {/* Izgara ölçüleri GERÇEK ızgaradan birebir (`assistant.desktop`): `auto-rows-fr` +
            `minmax(18rem,1fr)` + `gap-3.5`. Sekiz kart, 1280 pikselde iki tam satır demek — gerçek
            kuyruk genelde daha kalabalık, ama iskeletin işi listeyi tahmin etmek değil ilk ekranı
            doldurmak; fazlası, içerik gelince ekranın KISALMASI olurdu (`SkeletonRows` künyesi). */}
        <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3.5">
          {Array.from({ length: 8 }, (_, i) => (
            <ProposalCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

/**
 * Öneri kartının bekleme hâli — kabuk `ProposalCard` ile birebir: `min-h-[22rem]`, kalın üst şerit,
 * `p-3.5`, `gap-2.5`.
 *
 * Üst şerit RENKSİZ (`border-t-ops-line-strong`, kartın nötr tonu): renk tipi söyler ve hangi tipin
 * geleceğini henüz bilmiyoruz — sekiz kartı zeytin yeşiline boyamak, gelmeyen bir kuyruğu vaat
 * etmek olurdu.
 *
 * İçerik üç bloktan: rozet satırı (tip + yaş), gövde (tipin kendi önizlemesi — burada metin), ve
 * dibe yaslı durum satırı. Gerçek kartta gövdeyi tip veriyor ve tipler birbirine benzemiyor; iskelet
 * bu yüzden ortalama bir gövde çiziyor — ortak olan İSKELETTİR, kartın vaadi de o.
 */
function ProposalCardSkeleton() {
  return (
    <div
      className="flex min-h-[22rem] flex-col gap-2.5 rounded-ops-card border border-t-[3px] border-ops-line border-t-ops-line-strong bg-ops-white p-3.5"
      aria-hidden="true"
    >
      <span className="flex items-center gap-1.5">
        <Skeleton className="h-[18px] w-16 rounded-ops-chip" />
        <Skeleton className="ml-auto h-2.5 w-14" />
      </span>

      <SkeletonText lines={2} />

      {/* Tipe özel önizlemenin yeri: paket kareleri, fırsat görseli, para satırı — hepsi burada
          yaşıyor ve hepsi bir "blok" (dolu alan), metin değil. */}
      <Skeleton className="h-24 w-full rounded-ops-card" />

      <div className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between gap-2.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-3 w-14" />
        </span>
        <span className="flex items-baseline justify-between gap-2.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-3 w-12" />
        </span>
      </div>

      <Skeleton className="mt-auto ml-auto h-2.5 w-24" />
    </div>
  );
}
