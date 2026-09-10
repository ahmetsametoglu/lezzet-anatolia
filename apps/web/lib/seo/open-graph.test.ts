import { describe, expect, it } from 'vitest';
import { CROP_CENTER, FRAME_RATIOS, type FrameKey } from '@lezzet/types';
import type { ImageFrameSources, StorefrontImage } from '@lezzet/application';
import { openGraphOf, shareImageUrl } from './open-graph';

/**
 * Paylaşım kartının görseli (05.37) — CDN çerçevesi varsa onun tek adresi, yoksa özgün dosya, görsel
 * hiç yoksa alan HİÇ yazılmaz (boş `og:image` kartı kırar, kapının künyesi). Saf: DB ve ağ yok.
 */
const frame = (name: string) => ({ src: `https://cdn.test/${name}-1200`, srcSet: `https://cdn.test/${name}-200 200w` });
// Anahtar kümesi `FRAME_RATIOS`tan — çerçeve eklendiğinde fikstür elle güncellenmez.
const FRAMES = Object.fromEntries((Object.keys(FRAME_RATIOS) as FrameKey[]).map((key) => [key, frame(key)])) as ImageFrameSources;
const WITH_CDN: StorefrontImage = { url: 'https://cdn.test/ozgun.webp', crop: CROP_CENTER, frames: FRAMES };
const WITHOUT_CDN: StorefrontImage = { url: 'https://pub.r2.dev/ozgun.webp', crop: CROP_CENTER, frames: null };

describe('shareImageUrl', () => {
  it('CDN varsa sohbet kartı çerçevesi; koleksiyon kapağı istenirse bant', () => {
    expect(shareImageUrl(WITH_CDN)).toBe('https://cdn.test/chat-1200');
    expect(shareImageUrl(WITH_CDN, 'band')).toBe('https://cdn.test/band-1200');
  });

  it('CDN yoksa özgün adres; görsel yoksa null', () => {
    expect(shareImageUrl(WITHOUT_CDN)).toBe('https://pub.r2.dev/ozgun.webp');
    expect(shareImageUrl({ url: null, crop: CROP_CENTER, frames: null })).toBeNull();
    expect(shareImageUrl(null)).toBeNull();
  });
});

describe('openGraphOf — görsel alanı', () => {
  const base = { route: '/product/[slug]' as const, locale: 'fr' as const, params: { slug: 'baklava' }, title: 'Baklava' };

  it('kart görseli çerçeveden gelir', () => {
    expect(openGraphOf({ ...base, image: WITH_CDN })).toMatchObject({ images: ['https://cdn.test/chat-1200'] });
  });

  it('görselsiz künyede `images` alanı hiç yazılmaz', () => {
    const og = openGraphOf({ ...base, image: { url: null, crop: CROP_CENTER, frames: null } });
    expect(og && 'images' in og).toBe(false);
  });
});
