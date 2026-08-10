'use client';

import type { FeaturedFlagPayload } from '@lezzet/types';
import { num } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import type { AssistantRowView } from '../assistant-types';
import { Facts, SubjectBox, SummaryLine } from './shared';

/** Vitrin hedefinin türü — konu künyesiyle aynı kelimeyi kullanır (`lib/assistant/subject`). */
const TARGET_LABEL: Record<FeaturedFlagPayload['target'], string> = {
  category: 'Kategori',
  collection: 'Koleksiyon',
  bundle: 'Paket',
};

/**
 * VİTRİN İŞARETİ — tek bir aç/kapa kararı, ama yalnız başına verilemez.
 *
 * ── KARARIN KENDİSİ BÜYÜK YAZILIR ───────────────────────────────────────────
 * Öteki tiplerde kartın büyük satırı paradır; burada para yok, **yön** var: "Vitrine çıkar" ya da
 * "Vitrinden kaldır". İkisini küçük bir künye satırına gömmek, kartın ne teklif ettiğini okunmaz
 * kılardı — ızgarada iki zıt karar aynı görünürdü.
 *
 * ── VİTRİNDEKİ SAYI KARARIN YARISI ──────────────────────────────────────────
 * Vitrin bir liste değil bir SEÇKİdir: doluysa eklenen şey ötekini aşağı iter. "Bir tane daha
 * eklemek" ile "sekizinciyi eklemek" aynı karar değil ve fark ancak sayı görünürse fark edilir
 * (`currentlyFeaturedCount`, 22.5 denetim bulgusu). Sayı öneri anındaki hâldir — uygulama anında
 * değişmiş olabilir, o yüzden karar girdisi olarak sunuluyor, kural olarak değil.
 *
 * Alan HİÇ gelmemişse "0" denmiyor: sayılmamış olmak ile sıfır olmak ayrı şeyler (`CLAUDE §1`).
 */
export function FeaturedCard({ payload, row }: { payload: FeaturedFlagPayload; row: AssistantRowView }) {
  const on = payload.isFeatured;

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      <span className={`font-ops-display text-ops-lead font-semibold ${on ? 'text-ops-olive-dark' : 'text-ops-body'}`}>
        {on ? 'Vitrine çıkar' : 'Vitrinden kaldır'}
      </span>

      <Facts>
        <CardFact label="Tür" value={TARGET_LABEL[payload.target]} />
        <CardFact
          label="Vitrinde"
          value={
            payload.currentlyFeaturedCount === undefined
              ? 'sayılmadı'
              : `${num(payload.currentlyFeaturedCount)} ${TARGET_LABEL[payload.target].toLowerCase()}`
          }
        />
      </Facts>
    </>
  );
}
