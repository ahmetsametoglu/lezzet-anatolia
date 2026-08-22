import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';

/**
 * Etiket SVG'sinin PNG'ye çevrimi (23.7) — şablon `@lezzet/application` (`boxLabelSvg`, saf ve
 * testli); burada yalnız rasterin ALTYAPISI durur: font dosyaları ve native binding. Petit'in
 * raster deseni headless Chromium'dur; sapmanın gerekçesi şablonun künyesinde (label-svg.ts).
 *
 * Fontlar mobil operasyon temasıyla AYNI paketten (`@expo-google-fonts/karla` — Token Kararı 24'ün
 * sunucu ucu): etiketle ekran aynı yüzü taşır ve ikinci bir font kaynağı açılmaz. `loadSystemFonts`
 * KAPALI — sistem fontuna sessiz düşüş, dağıtım ortamında farklı etiket basardı (ölçülemeyen fark).
 */
const require = createRequire(import.meta.url);
const FONT_FILES = [
  require.resolve('@expo-google-fonts/karla/400Regular/Karla_400Regular.ttf'),
  require.resolve('@expo-google-fonts/karla/600SemiBold/Karla_600SemiBold.ttf'),
];

export function renderLabelPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Karla' },
  });
  return Buffer.from(resvg.render().asPng());
}
