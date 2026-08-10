'use client';

import { Badge } from '@/components/operation/ui/badge';
import type { OpsTone } from '@/components/operation/ui/tone';
import { agoLabel } from '@/components/operation/ui/format';
import { FRESHNESS, KIND_TONE, queueStatusLine } from './assistant-labels';
import type { AssistantRowView } from './assistant-types';

/**
 * ÖNERİ KARTI — ızgaranın tek hücresi (22.11).
 *
 * ── NEDEN LİSTE DEĞİL IZGARA (kullanıcı kararı 10.08) ───────────────────────
 * *"Grid şeklinde kartlar olacak, bir kart listesi şeklinde görünecek öneri. Her önerinin kendi kart
 * formatı olacak, sadece ön izleme için. Bu karta tıkladığımız zaman bir diyalog açılacak."*
 * Önceki kurgu dar bir liste sütunu + geniş bir karar panosuydu: kuyruk 326 piksele sıkışıyor, karar
 * panosu da her an tek bir öneriyi gösteriyordu. Izgara ikisini de düzeltiyor — öneriler yan yana
 * görünüyor (hangisi önce, hangisi bekleyebilir), karar ise kendi penceresinde tam alan buluyor.
 *
 * ── İSKELET ORTAK, GÖVDE TİPE ÖZEL ──────────────────────────────────────────
 * Rozet · tazelik · yaş · özet · tutar · durum HER kartta aynı yerde durur; ortadaki önizleme
 * gövdesini tip verir (`children`). İskelet de tipe bırakılsaydı on bir kart on bir farklı hizada
 * olurdu ve göz ızgarada tarama yeteneğini kaybederdi — ızgaranın tek gerekçesi tam olarak o tarama.
 *
 * ── KART BİR ÖZETTİR, KARARIN KENDİSİ DEĞİL ─────────────────────────────────
 * Buraya düzenlenebilir hiçbir şey konmaz. Kart "bu neyle ilgili, ne kadar acil, ne kadar para"
 * sorularını yanıtlar; "kaç lira yazayım" sorusu diyaloğun işidir. Karta form koymak, ızgarayı
 * yeniden bir karar panosuna çevirirdi.
 */
interface ProposalCardProps {
  row: AssistantRowView;
  onOpen: (id: string) => void;
  /** Tipin kendi önizleme gövdesi — yoksa kart yalnız ortak iskeletle çizilir. */
  children?: React.ReactNode;
}

export function ProposalCard({ row, onOpen, children }: ProposalCardProps) {
  const tone = KIND_TONE[row.kind];
  // Tazelik rozeti YALNIZ karar bekleyen kartta: uygulanmış bir öneride "süresi geçti" demek yanlış
  // bir şey söylemek olurdu — o öneri süresi dolmadan uygulandı, damgası sonradan geçti.
  const fresh = row.status === 'pending' && row.freshness !== 'ok' ? FRESHNESS[row.freshness] : null;
  const status = queueStatusLine(row);

  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      // `min-h` kartın BİÇİMİNİ tutuyor: 288 piksellik bir sütunda 22rem boy, dikey dikdörtgen
      // demek (kullanıcı kararı 10.08). Sabit yükseklik DEĞİL — ızgara `auto-rows-fr` ile kartları
      // zaten eşitliyor; taban yalnız KISA kartların (yalnız cümle taşıyan tipler) yatay dikdörtgene
      // düşmesini engelliyor, çünkü ızgarada biçim farkı "bu kartlar aynı türden değil" gibi okunur.
      //
      // 26 → 22rem: fırsatın görseli 16:9'a, paketin kareleri üç sütuna geçince iki tipin kendi
      // boyu birbirine yaklaştı ve eski taban gereksiz boşluk üretir olmuştu.
      className={`flex min-h-[22rem] cursor-pointer flex-col gap-2.5 rounded-ops-card border border-t-[3px] border-ops-line bg-ops-white p-3.5 text-left transition-colors hover:border-ops-line-strong ${CARD_TONE[tone]}`}
    >
      {/* Rozetler ÇERÇEVELİ (`outline`): kart artık tipin renginde ve dolgulu bir rozet kendi
          zeminine karışırdı — `Badge`in kendi künyesi de tam bunu söylüyor ("renkli bir kutunun
          içinde gerekli"). */}
      <span className="flex items-center gap-1.5">
        <Badge tone={tone} outline className="uppercase tracking-[0.06em]">
          {row.kindLabel}
        </Badge>
        {fresh ? (
          <Badge tone={fresh.tone} outline>
            {fresh.label}
          </Badge>
        ) : null}
        <span className="ml-auto flex-none font-ops-body text-ops-xs text-ops-muted">{agoLabel(row.ageMinutes)}</span>
      </span>

      {/* GÖVDEYİ TİP VERİR — özet cümlesi dahil (10.08, kullanıcı kararı: *"öneri özeti metin
          şeklinde olmasın, daha anlaşılır olsun"*). Bir tur `summary` burada, ortak iskelette
          çiziliyordu; ama bir fırsat önerisinde okunması gereken şey cümle değil ÜÇ SAYIDIR
          (ne kadar ucuzluyor, ne kadar vakit var, elde ne var). Cümleyi ortak iskelette tutmak,
          tipin kendi dilini kurmasını engelliyordu. Gövdesi olmayan tipler cümleye düşüyor
          (`assistant-card-bodies` varsayılanı) — yani hiçbir kart boş kalmıyor. */}
      {children}

      {/* ── TUTAR BURADAN KALKTI (10.08, kullanıcı ölçümü) ──────────────────────
          Kartın dibinde bir de `amountCents` yazıyordu ve paket kartında sonuç şuydu: `12,90 €`
          ikisi birden ekranda — biri fiyat bloğunda, biri dipte. Çerçeve, tipin gövdesi parayı
          zaten gösterdiği hâlde bir kez daha yazıyordu.
          Para artık GÖVDENİN işi: tipi bilen taraf onu kendi diliyle gösteriyor (fırsatta indirimli
          fiyat, pakette paket fiyatı), gövdesi olmayan tiplerde `SummaryLine` yazıyor. Dipte yalnız
          durum kaldı ve `mt-auto` ile yaslı — ızgarada kartların boyu değişiyor, durum satırı her
          kartta farklı yükseklikte olsaydı göz onu tarayamazdı. */}
      {status ? (
        <span className={`mt-auto pt-1 text-right font-ops-body text-ops-xs font-medium ${STATUS_LINE_CLASS[status.tone]}`}>
          {status.text}
        </span>
      ) : (
        <span className="mt-auto" />
      )}
    </button>
  );
}

/**
 * KARTIN TON ŞERİDİ — üst kenarda kalın ve DOYGUN renk (kullanıcı kararı 10.08).
 *
 * ── ZEMİN NEDEN BEYAZA DÖNDÜ ────────────────────────────────────────────────
 * Bir tur kartın zemini tonun en soluk basamağıydı (`*-bg`) ve ölçüm bunun neden çalışmadığını
 * gösterdi: `olive-bg` = `#eef4e2`, `amber-bg` = `#fdf1e3`. O basamak **rozet arkası** için
 * tasarlanmış — küçük bir yüzeyde renk okunur, 288×416'lık bir kartta ikisi de "kirli beyaz"a
 * düşüyor. Üstelik zeytin yeşili zaten sarımsı bir yeşil, yani indirim kartı SARI görünüyordu
 * (kullanıcı ölçümü: *"indirim kartları neden sarı renkte"*). Göz yanılmadı, token yanlış yerde
 * kullanıldı.
 *
 * Doygun renk küçük bir alanda taşınır: 3 pikselik üst şerit `#eef4e2` ile `#fdf1e3` arasındaki
 * ayrımı değil, zeytin yeşili ile amber arasındaki ayrımı gösteriyor — ve o ayrım tartışmasız.
 *
 * Renk süs değil ARAMA aracı: ızgarada on beş kart varken "fırsatlar nerede" sorusu okumadan
 * cevaplanabilmeli. Ton sözlüğü kapalı bir liste (`ui/tone`), tip→ton eşlemesi tek yerde
 * (`KIND_TONE`); burada yalnız o tonun KART karşılığı var.
 *
 * **11 tip 6 tonu paylaşıyor ve bu bilinçli:** palet DURUM renkleridir (olive=yolunda,
 * amber=dikkat, blue=aday, violet=makine konuştu). Her tipe ayrı renk vermek ya paleti anlamsız
 * kılardı ya da ızgarayı on bir renkli bir karnavala çevirirdi. Aynı renkli iki tipi rozet metni
 * ayırıyor — renk aileyi, yazı tipi söylüyor.
 */
const CARD_TONE: Record<OpsTone, string> = {
  neutral: 'border-t-ops-line-strong',
  olive: 'border-t-ops-olive',
  amber: 'border-t-ops-amber',
  red: 'border-t-ops-red',
  blue: 'border-t-ops-blue',
  slate: 'border-t-ops-slate',
  violet: 'border-t-ops-violet',
};

/**
 * Kart künyesi — tipe özel gövdelerin ortak satırı. Etiket solda sönük, değer sağda mono; öneri
 * diyaloğundaki künyeyle (`ProposalAside`) aynı okuma biçimi, ki karttan diyaloğa geçen göz aynı
 * şeyi aynı hizada bulsun.
 *
 * Değer SARILIR, kırpılmaz: kart dar (280 px) ve "Schiltigheim / Bischheim" gibi bir kapsam adının
 * ortasından kesilmesi, kararın konusunu götürür. Uzun değer iki satıra iner — kartın boyu zaten
 * içeriğe göre uzuyor.
 */
export function CardFact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex items-baseline justify-between gap-2.5">
      <span className="flex-none font-ops-body text-ops-sm text-ops-muted">{label}</span>
      <span className={`text-right font-ops-mono text-ops-sm font-semibold ${tone ?? 'text-ops-ink'}`}>{value}</span>
    </span>
  );
}

/**
 * Durum cümlesinin rengi. `neutral` burada METİN olduğu için `ops-muted`'a düşer — rozetin nötr
 * zemini bir metin satırında görünmez.
 *
 * Sınıf HARİTADAN gelir, dizge birleştirmeyle değil: Tailwind sınıfları kaynak metinden tarıyor ve
 * `text-ops-${tone}` gibi bir ifade hiçbir sınıf üretmez — renk sessizce düşerdi.
 */
const STATUS_LINE_CLASS: Record<string, string> = {
  olive: 'text-ops-olive-dark',
  red: 'text-ops-red',
  neutral: 'text-ops-muted',
};
