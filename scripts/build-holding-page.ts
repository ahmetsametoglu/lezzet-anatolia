// Kök adres lansmana kadar uygulamayı değil künyeli bir tanıtım sayfasını gösterir; test dağıtımlarından
// bağımsız kalsın diye durağan dosyadır. Metin, künye ve renk elle yazılmaz: repodaki tek kaynaklardan üretilir.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { brand, fillBrandFacts, whatsappHref } from '../packages/brand/src/index';
import { flattenThemeTokens } from '../packages/design-tokens/src/render-theme-css';
import { DEFAULT_LOCALE, LOCALES } from '../packages/i18n/src/locale';
import { PATHNAMES } from '../packages/i18n/src/paths';
import { copyForSurface } from '../packages/i18n/src/surface-copy';

type Locale = (typeof LOCALES)[number];

interface HomeCopy {
  meta: { title: string; description: string };
  hero: { eyebrow: string; titleLead: string; titleAccent: string; body: string };
}
interface LegalSection {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets: string[];
}
interface LegalCopy {
  title: string;
  sections: LegalSection[];
}
type PrivacyCopy = LegalCopy & { notice: { text: string } };
interface PageCopy {
  soon: string;
  contactTitle: string;
  phone: string;
  whatsapp: string;
  email: string;
  languages: string;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist/holding-page');
const ORIGIN = 'https://lezzetanatolie.com';

const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;

const home = readJson<Record<Locale, HomeCopy>>('apps/web/app/(customer)/[locale]/messages.json');
// Yasal metin native ile ortak sözlükten; sayfa bir web sayfası olduğu için web hâli seçilir.
const legalPages = copyForSurface(
  readJson<Record<Locale, { pages: { terms: LegalCopy; privacy: PrivacyCopy } }>>('packages/i18n/src/customer/legal.json'),
  'web',
);
const byLocale = <T>(pick: (locale: Locale) => T): Record<Locale, T> =>
  Object.fromEntries(LOCALES.map((locale) => [locale, pick(locale)])) as Record<Locale, T>;
const legal = fillBrandFacts(byLocale((locale) => legalPages[locale].pages.terms));
const privacy = fillBrandFacts(byLocale((locale) => legalPages[locale].pages.privacy));
const page = readJson<Record<Locale, PageCopy>>('scripts/holding-page/messages.json');

// Token adı değişirse üretim düşer; sayfa sessizce eski tonla kalmaz.
const COLORS = ['ink', 'body', 'muted', 'cream', 'olive', 'olive-dark', 'olive-bg', 'sand-50', 'sand-275', 'sand-500', 'neutral-400'];
const tokens = flattenThemeTokens();
const colorVars = COLORS.map((name) => {
  const value = tokens[`--color-${name}`];
  if (!value) throw new Error(`Token yok: --color-${name}`);
  return `--color-${name}:${value}`;
}).join(';');

// Yazı tipleri sayfayla birlikte sunulur: Google'ın sunucusundan yüklemek ziyaretçinin adresini ona iletir.
const requireFrom = createRequire(join(ROOT, 'apps/mobile-customer/package.json'));
const fontDir = (pkg: string): string => dirname(requireFrom.resolve(`${pkg}/package.json`));
const FONTS = [
  { family: 'Lora', weight: 600, style: 'normal', pkg: '@expo-google-fonts/lora', file: '600SemiBold/Lora_600SemiBold.ttf' },
  { family: 'Lora', weight: 600, style: 'italic', pkg: '@expo-google-fonts/lora', file: '600SemiBold_Italic/Lora_600SemiBold_Italic.ttf' },
  { family: 'Karla', weight: 400, style: 'normal', pkg: '@expo-google-fonts/karla', file: '400Regular/Karla_400Regular.ttf' },
  { family: 'Karla', weight: 600, style: 'normal', pkg: '@expo-google-fonts/karla', file: '600SemiBold/Karla_600SemiBold.ttf' },
  { family: 'Karla', weight: 700, style: 'normal', pkg: '@expo-google-fonts/karla', file: '700Bold/Karla_700Bold.ttf' },
] as const;

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const localePrefix = (locale: Locale): string => (locale === DEFAULT_LOCALE ? '' : `/${locale}`);
const homePath = (locale: Locale): string => `${localePrefix(locale)}/`;
// Google marka doğrulaması gizlilik politikasını ana sayfanın alan adında ve ana sayfadan bağlı ister.
const privacyPath = (locale: Locale): string => `${localePrefix(locale)}${PATHNAMES['/legal/privacy'][locale]}/`;

const fontFaces = FONTS.map(
  (f) =>
    `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};font-display:swap;src:url(/fonts/${basename(f.file)}) format('truetype')}`,
).join('');

const STYLE = `${fontFaces}
:root{${colorVars}}
*{box-sizing:border-box}
body{margin:0;background:var(--color-cream);color:var(--color-ink);font:400 16px/1.6 'Karla',sans-serif}
a{color:var(--color-olive);text-decoration:none}
a:hover{color:var(--color-olive-dark)}
.wrap{max-width:1100px;margin:0 auto;padding:0 clamp(20px,5vw,48px)}
.top{border-bottom:1px solid var(--color-sand-275)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-top:18px;padding-bottom:18px}
.brand{display:inline-flex;align-items:center;gap:12px;color:var(--color-ink);font:600 22px 'Lora',serif}
.brand:hover{color:var(--color-ink)}
.langs{display:flex;gap:14px;font:600 14px 'Karla',sans-serif;color:var(--color-muted)}
.langs a{color:inherit}
.langs [aria-current]{color:var(--color-olive)}
main.wrap{display:grid;gap:40px;padding-top:clamp(40px,8vw,72px);padding-bottom:clamp(40px,8vw,72px)}
.hero{display:flex;flex-direction:column;gap:20px;max-width:720px}
.eyebrow{font:600 14px 'Karla',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--color-olive)}
h1{margin:0;font:600 clamp(34px,6vw,52px)/1.15 'Lora',serif}
h1 em{color:var(--color-olive)}
.hero p{margin:0;font-size:18px;color:var(--color-body)}
.hero .soon{align-self:flex-start;background:var(--color-olive-bg);color:var(--color-olive-dark);font:700 15px 'Karla',sans-serif;padding:12px 22px;border-radius:26px}
.contact{border:1.5px dashed var(--color-sand-500);border-radius:22px;padding:24px clamp(20px,4vw,32px)}
.contact h2{margin:0 0 12px;font:700 17px 'Karla',sans-serif}
.contact ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.contact li{display:flex;flex-wrap:wrap;gap:2px 12px}
.contact li span{min-width:110px;color:var(--color-muted)}
.contact a{font-weight:700}
.doc{max-width:760px;color:var(--color-body)}
.doc h1{margin-bottom:8px;font-size:clamp(28px,5vw,40px);color:var(--color-ink)}
.doc h2{margin:28px 0 8px;font:700 18px 'Karla',sans-serif;color:var(--color-ink)}
.doc p{margin:0 0 8px}
.doc ul{margin:0 0 8px;padding-left:20px}
.doc .notice{margin-top:32px;font-weight:600;color:var(--color-ink)}
.doc .notice a{font-weight:700}
.legal{background:var(--color-ink);color:var(--color-neutral-400);font-size:14px;padding:36px 0}
.legal h2{margin:0 0 8px;font:600 18px 'Lora',serif;color:var(--color-sand-50)}
.legal h3{margin:20px 0 6px;font:700 14px 'Karla',sans-serif;color:var(--color-sand-50)}
.legal p{margin:0 0 6px}
.legal ul{margin:0;padding-left:18px}
.legal .links{margin-top:24px}
.legal .links a{color:var(--color-sand-50);text-decoration:underline}`;

const renderSections = (sections: LegalSection[], heading: 'h2' | 'h3'): string =>
  sections
    .map(
      (s) =>
        `<section><${heading}>${esc(s.heading)}</${heading}>${s.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')}${
          s.bullets.length ? `<ul>${s.bullets.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''
        }</section>`,
    )
    .join('');

interface ShellInput {
  locale: Locale;
  pathFor: (locale: Locale) => string;
  title: string;
  description: string;
  main: string;
}

// İki sayfa aynı üst bandı ve künyeyi taşır; dil düğmeleri aynı sayfanın öteki dillerine gider.
function renderShell({ locale, pathFor, title, description, main }: ShellInput): string {
  const p = page[locale];
  const l = legal[locale];
  const alternates = [
    ...LOCALES.map((alt) => `<link rel="alternate" hreflang="${alt}" href="${ORIGIN}${pathFor(alt)}">`),
    `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${pathFor(DEFAULT_LOCALE)}">`,
  ].join('');
  const langs = LOCALES.map((alt) =>
    alt === locale
      ? `<span aria-current="page">${alt.toUpperCase()}</span>`
      : `<a href="${pathFor(alt)}" hreflang="${alt}" lang="${alt}">${alt.toUpperCase()}</a>`,
  ).join('');
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${ORIGIN}${pathFor(locale)}">
${alternates}
<link rel="icon" href="/logo-isaret.png">
<style>${STYLE}</style>
</head>
<body>
<header class="top"><div class="wrap">
<a class="brand" href="${homePath(locale)}"><img src="/logo-isaret.png" alt="" width="44" height="44">${esc(brand.name)}</a>
<nav class="langs" aria-label="${esc(p.languages)}">${langs}</nav>
</div></header>
<main class="wrap">
${main}
</main>
<footer class="legal" id="legal"><div class="wrap">
<h2>${esc(l.title)}</h2>
${renderSections(l.sections, 'h3')}
<p class="links"><a href="${privacyPath(locale)}">${esc(privacy[locale].title)}</a></p>
</div></footer>
</body>
</html>
`;
}

function renderHome(locale: Locale): string {
  const h = home[locale];
  const p = page[locale];
  const { phoneE164, phoneDisplay, email } = brand.contact;
  return renderShell({
    locale,
    pathFor: homePath,
    title: `${brand.name} · ${h.meta.title}`,
    description: h.meta.description,
    main: `<section class="hero">
<span class="eyebrow">${esc(h.hero.eyebrow)}</span>
<h1>${esc(h.hero.titleLead)}<br><em>${esc(h.hero.titleAccent)}</em></h1>
<p>${esc(h.hero.body)}</p>
<p class="soon">${esc(p.soon)}</p>
</section>
<section class="contact">
<h2>${esc(p.contactTitle)}</h2>
<ul>
<li><span>${esc(p.phone)}</span><a href="tel:${phoneE164}">${esc(phoneDisplay)}</a></li>
<li><span>${esc(p.whatsapp)}</span><a href="${esc(whatsappHref())}">${esc(phoneDisplay)}</a></li>
<li><span>${esc(p.email)}</span><a href="mailto:${email}">${esc(email)}</a></li>
</ul>
</section>`,
  });
}

function renderPrivacy(locale: Locale): string {
  const c = privacy[locale];
  const { email } = brand.contact;
  return renderShell({
    locale,
    pathFor: privacyPath,
    title: `${c.title} · ${brand.name}`,
    description: c.title,
    main: `<article class="doc">
<h1>${esc(c.title)}</h1>
${renderSections(c.sections, 'h2')}
<p class="notice">${esc(c.notice.text)} <a href="mailto:${email}">${esc(email)}</a></p>
</article>`,
  });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'fonts'), { recursive: true });
for (const f of FONTS) copyFileSync(join(fontDir(f.pkg), f.file), join(OUT, 'fonts', basename(f.file)));
for (const pkg of new Set(FONTS.map((f) => f.pkg))) {
  copyFileSync(join(fontDir(pkg), 'LICENSE_FONT'), join(OUT, 'fonts', `${basename(pkg)}-OFL.txt`));
}
copyFileSync(join(ROOT, 'apps/web/public/logo-isaret.png'), join(OUT, 'logo-isaret.png'));
const PAGES = [
  { pathFor: homePath, render: renderHome },
  { pathFor: privacyPath, render: renderPrivacy },
];
for (const locale of LOCALES) {
  for (const { pathFor, render } of PAGES) {
    const dir = join(OUT, pathFor(locale));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), render(locale));
  }
}
process.stdout.write(`${OUT}: ${LOCALES.flatMap((l) => PAGES.map((p) => p.pathFor(l))).join(' · ')}\n`);
