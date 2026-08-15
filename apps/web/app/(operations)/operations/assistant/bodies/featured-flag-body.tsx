'use client';

import type { FeaturedFlagPayload } from '@lezzet/types';
import { FeaturedFormBody } from '@/components/operation/form/featured-form/body';
import { featuredSummary, type FeaturedCandidate, type FeaturedFormValues } from '@/components/operation/form/featured-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { num } from '@/components/operation/ui/format';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * VİTRİN ÖNERİSİ — kuyruğun içinde, IZGARANIN TAMAMI düzenlenebilir (22.35).
 *
 * ── NEDEN GEREKTİ ───────────────────────────────────────────────────────────
 * Tip gövdesizdi ve karar iki uçluydu: onayla ya da reddet. Ama vitrin bir liste değil bir SEÇKİdir
 * ve kontenjanı var — dolu bir ızgaraya ekleme yapmak sıradaki birini ana sayfadan düşürür. Önizleme
 * bunu SÖYLÜYORDU (*"ızgara dolu — bu kayıt eklenirse sıradaki biri görünmez olur"*) ama kimin
 * düşeceğine karar vermenin yolu yoktu; onay o kararı sessizce veriyordu.
 *
 * Kullanıcı kararı 15.08: *"biz yönlendirme yapmıyoruz; doğrudan açılan diyaloğun içerisinde
 * düzenlenecek ortak komponent yapıyoruz."* Öneriyi reddedip aynı işi katalog ekranında elle yapmak,
 * kuyruğun var oluş sebebini silerdi.
 *
 * ── HEDEF TÜRÜ NEYİ DEĞİŞTİRİR ──────────────────────────────────────────────
 * `target` üç şeyden biri (kategori · koleksiyon · paket) ve her birinin AYRI kontenjanı var
 * (`FEATURED_SLOTS`). Aday listesi de ona göre seçiliyor: kategori önerisinde koleksiyonları
 * göstermek, ilgisiz bir ızgarayı tartıştırmak olurdu.
 */

const TARGET_LABEL: Record<FeaturedFlagPayload['target'], string> = {
  category: 'kategori',
  collection: 'koleksiyon',
  bundle: 'paket',
};

/** Hedef türünün adayları — `AssistantFormOptions`taki üç listeden doğru olanı. */
function featuredCandidates(payload: FeaturedFlagPayload, options: AssistantFormOptions): FeaturedCandidate[] {
  const source =
    payload.target === 'category' ? options.categories : payload.target === 'collection' ? options.collections : options.bundles;
  return source.map((row) => ({ id: row.id, name: row.name, isActive: row.isActive }));
}

/**
 * Dilekçe → formun açılış değerleri: ızgaranın BUGÜNKÜ hâli + önerinin istediği değişiklik.
 *
 * Öneri "çıkar" diyorsa konu kümeden düşürülür — açılış, uygulanmış hâli göstermeli ki patron
 * sonucu görsün ve gerekirse geri alsın.
 */
export function featuredValuesFrom(payload: FeaturedFlagPayload, options: AssistantFormOptions): FeaturedFormValues {
  const featuredNow = sourceOf(payload, options)
    .filter((row) => row.isFeatured)
    .map((row) => row.id);
  // Konu önce ÇIKARILIR, sonra dilekçenin yönüne göre geri konur: öneri "zaten vitrinde olanı
  // vitrine al" diyorsa listede iki kez durmasın.
  const withoutSubject = featuredNow.filter((id) => id !== payload.id);
  return { featuredIds: payload.isFeatured ? [...withoutSubject, payload.id] : withoutSubject };
}

/** Hedef türünün HAM kaynağı — `isFeatured` yalnız açılış değerini kurarken okunur. */
function sourceOf(payload: FeaturedFlagPayload, options: AssistantFormOptions) {
  return payload.target === 'category' ? options.categories : payload.target === 'collection' ? options.collections : options.bundles;
}

interface FeaturedFlagBodyProps {
  payload: FeaturedFlagPayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  values: FeaturedFormValues;
  onChange: (next: FeaturedFormValues) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function FeaturedFlagBody({ payload, subject, options, meta, values, onChange, disabled, readOnly }: FeaturedFlagBodyProps) {
  const candidates = featuredCandidates(payload, options);
  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[26rem] flex-[3] basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <FeaturedFormBody
          values={values}
          onChange={onChange}
          candidates={candidates}
          subjectId={payload.id}
          target={payload.target}
          targetLabel={TARGET_LABEL[payload.target]}
          disabled={disabled || readOnly}
        />
      </div>

      <ProposalAside
        subject={subject}
        fallbackTitle="Vitrin işareti"
        facts={factsOf(payload, values, candidates)}
        payload={payload}
        meta={meta}
      />
    </div>
  );
}

/** Dilekçenin sayıları — satır YALNIZ sapma varken çizilir (`ProposalAside` künyesi). */
function factsOf(payload: FeaturedFlagPayload, values: FeaturedFormValues, candidates: FeaturedCandidate[]): ProposalFact[] {
  const summary = featuredSummary(values, candidates, payload.target);
  return [
    { label: 'Karar', value: payload.isFeatured ? 'Vitrine al' : 'Vitrinden çıkar' },
    // Dilekçenin ölçtüğü sayı ile formun bugünkü hâli: patron ızgarayı değiştirdiyse fark burada
    // görünür (`currentlyFeaturedCount` önerinin KURULDUĞU andı, uygulama anı değil).
    ...(payload.currentlyFeaturedCount === undefined
      ? []
      : [{ label: 'Vitrinde', value: num(payload.currentlyFeaturedCount), now: num(summary.visible) }]),
    { label: 'Izgara', value: `${num(summary.slots)} yer` },
  ];
}
