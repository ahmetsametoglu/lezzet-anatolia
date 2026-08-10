'use client';

import { resolveLocalizedText, type ProductCreatePayload } from '@lezzet/types';
import { num, percent } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import { BandBox, BandLabel, BandNote, CardLead, Facts, GapFact, UncertainFact } from './shared';

/**
 * YENİ ÜRÜN — görseli OLMAYAN ikinci tip, ama sebebi para hareketininkinden başka: ürün henüz
 * DOĞMAMIŞTIR. Fotoğraf onaylandıktan sonra ürün ekranından yüklenir.
 *
 * ── BANDI ÜRÜNÜN KİMLİĞİ DOLDURUYOR ─────────────────────────────────────────
 * Ad (TR) + kategori + boylar. Bir katalog kararında ilk sorulan üç şey bunlar; "kaç boyu var"
 * özellikle önemli çünkü **varyantsız ürün satılamaz** (fiyat ve stok varyanta bağlı).
 *
 * ── TANITIM METNİ GÖSTERİLİYOR ──────────────────────────────────────────────
 * Müşteri sayfasına aynen bu çıkacak. Bir tur karta hiç konmamıştı (kullanıcı sorusu 11.08:
 * *"başka eksik bir şey var mı?"*) — dilekçede dolu duran bir metni göstermemek, onaylanan şeyi
 * görünmez kılmaktı.
 *
 * ── EKSİK BEYAN GİZLENMİYOR ─────────────────────────────────────────────────
 * `remainingGaps` yasal beyanın onaydan SONRA da eksik kalacak parçaları. Ürün eksik beyanla
 * yaratılabilir (taslak olarak durur, vitrine çıkmaz); saklanması gereken bir kusur değil, onay
 * sonrası yapılacak işin listesi. Sayı olarak yazılıyor — gerekçe `GapFact` künyesinde.
 */
export function ProductCreateCard({ payload }: { payload: ProductCreatePayload }) {
  const name = resolveLocalizedText(payload.name, 'tr');
  const description = payload.description ? resolveLocalizedText(payload.description, 'tr') : '';

  return (
    <>
      <BandBox>
        <BandLabel>{payload.categoryName ?? 'kategorisiz'}</BandLabel>
        <span className="line-clamp-2 font-ops-display text-ops-lead font-semibold leading-snug text-ops-ink">{name}</span>
        <BandNote>{payload.variants.map((v) => resolveLocalizedText(v.label, 'tr')).join(' · ')}</BandNote>
      </BandBox>

      {description ? <CardLead muted>{description}</CardLead> : null}

      <Facts>
        <UncertainFact fields={payload.uncertainFields} />
        {/* Eksik beyan ÖNCE: onay sonrası iş yükünü söyleyen satır, KDV'den önce okunmalı. */}
        <GapFact gaps={payload.remainingGaps} showEmpty />
        <CardFact label="Boy" value={`${num(payload.variants.length)} çeşit`} />
        {/* Tarih tipi ile raf ömrü tek satırda ve bu birleştirme bilinçli: ikisi TEK kuralın iki
            yarısı — "DDM · 30 gün" bir partinin ne zaman düşeceğini söyler, ayrı ayrı hiçbir şey. */}
        <CardFact
          label="Tarih"
          value={`${payload.dateType}${payload.shelfLifeDays ? ` · ${num(payload.shelfLifeDays)} gün` : ''}`}
        />
        <CardFact label="KDV" value={percent(payload.vatRate, 1)} />
      </Facts>
    </>
  );
}
