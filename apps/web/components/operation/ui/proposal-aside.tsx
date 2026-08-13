'use client';

import { useState, type ReactNode } from 'react';
import { SubjectCard } from './subject-card';
import { PayloadTree } from './payload-tree';
import { UnderlineTabs } from './underline-tabs';

/**
 * ÖNERİNİN ÖNİZLEMESİ — konu kartı + asistanın dilekçesi, formun YANINDA (22.10).
 *
 * ── NEDEN VAR: FORMUN GÖSTERDİĞİ ŞEY DEĞİŞİYOR, DİLEKÇE DEĞİŞMİYOR ──────────
 * Kullanıcının kendi cümlesi (10.08): *"Formda bazı değişiklikler yapsam bile formun varsayılan
 * değeri önerilen şekilde dolar; ama ben değiştirdiğim zaman önerinin ne olduğunu unutmam."*
 * Form bir TASLAKTIR ve operatör ona dokundukça asistanın ne dediği kaybolur. Bu sütun o kaydı
 * tutuyor: dokunulmaz, düzenlenmez, hep öneri anındaki hâli gösterir.
 *
 * ── SİLİNEN ÖNİZLEMEYLE AYNI ŞEY DEĞİL ──────────────────────────────────────
 * `assistant-preview` formun YERİNE anlatıyordu — bu yüzden silindi (aynı kararın iki dili). Bu
 * sütun formun YANINDA duruyor ve başka bir soruya cevap veriyor: "ne yazıyorum" değil, "asistan
 * ne demişti". İkisi aynı anda doğru olabilir ve ayrıştıkları an da zaten ekranda görünür.
 *
 * ── SAPMA SATIRDA GÖRÜNÜR ───────────────────────────────────────────────────
 * Operatör bir kutuyu değiştirince o satır iki değer taşır: asistanınki sönük, yenisi güçlü.
 * Ayrı bir "değişiklikler listesi" kurulmuyor — fark, ait olduğu satırın üstünde durur.
 *
 * ── ORTAK, ÇÜNKÜ ONBİR TİPİN ORTAK KURGUSU BU ───────────────────────────────
 * Kullanıcı kararı (10.08): *"Bu diğer öneri tiplerinde de olsun… özetle bir önerinin önizlemesi
 * olacak, bir de kategori/koleksiyon/ürün her ne ile ilgiliyse onunla alakalı bir tanıtım kartı,
 * bir de form."* Tip başına yazılsaydı on bir kopya doğardı ve üçüncüsünde biri sapmayı göstermeyi
 * unuturdu.
 */

/**
 * Kararın TEKNİK künyesi — ham dilekçenin yanında okunur ("Metadata" görünümü).
 *
 * Bir tur bu bilgi diyaloğun DİBİNDE katlanmış bir bloktu ("Teknik döküm"). Kullanıcı kaldırttı
 * (11.08) ve gerekçesi ölçülebilirdi: blok yukarı doğru açılıp formun alanını yiyordu, kendi içinde
 * kaydırılmıyordu ve zaten aynı şeyi anlatıyordu — asistanın ne yazdığını. Artık dilekçe sütununun
 * ikinci görünümü: aynı yerde, aynı kaydırma alanında, formun alanına dokunmadan.
 */
export interface ProposalMeta {
  /** Öneri kimliği — konuşmada ilk sekiz hanesiyle anılır. */
  id: string;
  /** Uygulamanın yazacağı tablolar (`bundle`, `bundle_item`…). */
  targetTables: string[];
  /** Uygulama sonrası doğan kayıtların kimlikleri; karar verilmemişse `null`. */
  result: Record<string, string> | null;
}

/**
 * Önizlemenin tek satırı. **`now` verilmişse satır YALNIZ SAPMA VARKEN çizilir** (kullanıcı kararı
 * 12.08).
 *
 * Bu satırlar bir tur hep duruyordu ve dilekçe ağacının hemen üstünde aynı alanları tekrar
 * ediyordu: para hareketinde Tutar · Hesap · Yön üstte bir kez, ağaçta bir kez daha. Blokla ağacın
 * işi zaten farklıydı — biri "ne değiştirdim", öteki "asistan ne yazmıştı" — ama fark ancak sapma
 * OLDUĞUNDA görünüyor; sapma yokken ikisi birebir aynı şeyi söylüyordu.
 *
 * **`now` VERİLMEYEN satır her zaman çizilir** ve bu ayrım bilinçli: o satırlar dilekçenin bir
 * alanını tekrar etmiyor, ondan TÜRETİLMİŞ bir özet taşıyor — "asistan hangi beyanları doldurdu",
 * "hangi alanların üstüne yazılacak", "kaç dil dolu". Ağaçta karşılığı yok; gizlenselerdi tekrar
 * değil, bilgi kaybolurdu. Kural şu: **karşılaştırılabilir olan sapmada konuşur, türetilmiş olan
 * hep konuşur.**
 */
export interface ProposalFact {
  label: string;
  /** ASİSTANIN önerdiği değer — değişmez. */
  value: string;
  /**
   * Operatörün şu anki değeri. Verilirse satır KARŞILAŞTIRMA olur ve yalnız `value`dan farklıyken
   * çizilir; verilmezse satır türetilmiş bir özettir ve hep durur.
   */
  now?: string | null;
}

interface ProposalAsideProps {
  /** Kararın konusu (ürün · kategori · koleksiyon…). `null` ise `fallbackTitle` yazılır. */
  subject: {
    name: string;
    detail: string | null;
    imageUrl: string | null;
    href: string | null;
  } | null;
  /** Konusu olmayan öneride tek satırlık karşılık ("Sepetin tamamı") — uydurma kart çizilmez. */
  fallbackTitle: string;
  /**
   * Elle kurulmuş künye satırları — tipin ÖNE ÇIKARDIĞI birkaç değer (fırsatta teklif ve liste
   * fiyatı gibi). Dilekçenin tamamı ayrıca `payload` ile basılıyor; buradaki satırlar onun yerine
   * değil, ÜSTÜNDE durur.
   */
  facts?: ProposalFact[];
  /**
   * Ham dilekçe — okunur bir ağaca çevrilip basılır (`PayloadTree`, 22.15).
   *
   * Kullanıcı kararı 11.08: *"ajandan gelen bilginin en sağda bir sütun şeklinde özeti olsun… JSON'ın
   * daha okunabilir şekilde çevrilmiş hâli. Bu tüm öneri diyaloglarında standart olacak."* Tip başına
   * elle künye yazmak şemaya eklenen alanı sessizce görünmez kılıyordu (22.12'de on iki alan açıldı,
   * hiçbiri kendiliğinden ekrana çıkmadı).
   */
  payload?: unknown;
  /** Ham dilekçenin künyesi — "Metadata" görünümünde okunur. Verilmezse yalnız JSON basılır. */
  meta?: ProposalMeta;
  /** Karara özel ek not (tipin kendi uyarısı). */
  footer?: ReactNode;
}

export function ProposalAside({ subject, fallbackTitle, facts, payload, meta, footer }: ProposalAsideProps) {
  // Görünüm YEREL: hangi hâle bakıldığı kararın parçası değil, okuma tercihi.
  const [view, setView] = useState<'view' | 'meta'>('view');
  // Karşılaştırma satırı sapmada, türetilmiş satır her zaman (`ProposalFact` künyesi).
  const shownFacts = (facts ?? []).filter((fact) => fact.now == null || fact.now !== fact.value);

  return (
    // `min-h-0` ŞART: sütun kendi içinde kaydırıyor (dilekçe ağacı uzun olabiliyor) ve flexbox'ın
    // varsayılan `min-height: auto`'su altındaki `overflow-y-auto`yu etkisiz kılardı — Dialog
    // gövdesinde yaşanan arızanın aynısı (`dialog.tsx` künyesi, 11.08).
    <div className="flex min-h-0 min-w-[15rem] flex-1 basis-0 flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
      <div className="flex flex-none items-center justify-between gap-2">
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.12em] text-ops-muted">Asistanın önerisi</span>
        {payload !== undefined ? (
          <UnderlineTabs
            value={view}
            onChange={setView}
            className="-my-1"
            items={[
              { key: 'view', label: 'Görünüm', title: 'Dilekçenin okunur hâli' },
              { key: 'meta', label: 'Metadata', title: 'Ham dilekçe · hedef tablolar · öneri kimliği' },
            ]}
          />
        ) : null}
      </div>

      {/* ── TEK KAYDIRMA BÖLGESİ: konu kartı da içeride (11.08) ─────────────────
          Bir tur yalnız dilekçe ağacı kaydırılıyordu; kartla künye sütunun ÜSTÜNDE sabit duruyordu.
          Sütun daraldığında (küçük ekran, uzun ürün adı) sabit kısım tek başına sütunu doldurup
          ağaca sıfır yer bırakıyor ve altta kalan her şey kırpılıyordu — kullanıcının ölçtüğü arıza
          buydu: *"kaydırılabilir alan var ve çalışıyor, ama en aşağı indiğimde bile en altı
          görünmüyor."* Başlık dışında ne varsa aynı bölgede kaydığı için artık kırpılacak bir şey yok.

          `flex-auto` (`basis:auto`) bilinçli, `flex-1` (`basis:0`) DEĞİL: yükseklik dıştan
          BELİRLİYSE (ürün diyaloğu) ikisi de doğru çalışır, ama belirsizse `basis:0` bölgeyi sıfıra
          çökertir ve içerik hiç görünmez. `basis:auto` o durumda içeriği kadar uzar. */}
      {/* `-mr-3 pr-3` = kaydırma çubuğunun KENDİ ŞERİDİ. macOS'ta çubuk içeriğin üstüne çizilir
          (overlay) ve metnin sağ kenarını yerdi. Negatif marj kaydırma kutusunu kartın iç kenarına
          kadar genişletiyor, içerideki dolgu da metni bugünkü yerinde tutuyor: çubuk artık boş
          şeridin üstünde. Sabit genişlik vermek yerine kartın kendi dolgusu (`p-3`) kullanıldı —
          iki sayı ayrı yazılsaydı biri değişince öteki unutulurdu. */}
      <div className="-mr-3 flex min-h-0 flex-auto flex-col gap-2.5 overflow-y-auto pr-3">
        {view === 'meta' ? (
          <MetaFace payload={payload} meta={meta} />
        ) : (
          <>
            {subject ? (
              <SubjectCard name={subject.name} detail={subject.detail} imageUrl={subject.imageUrl} href={subject.href} size={96} />
            ) : (
              <span className="font-ops-display text-ops-lead font-semibold text-ops-ink">{fallbackTitle}</span>
            )}

            {/* Süzgeç BURADA, `Row`un içinde değil: satır kendi kendini gizleseydi blok boşken de
                kenarlığını ve boşluğunu çizmeye devam ederdi — sütunda sebepsiz bir çizgi kalırdı. */}
            {shownFacts.length > 0 ? (
              <dl className="flex flex-col gap-1 border-t border-ops-line pt-2 font-ops-body text-ops-base text-ops-body">
                {shownFacts.map((fact) => (
                  <Row key={fact.label} fact={fact} />
                ))}
              </dl>
            ) : null}

            {/* Dilekçenin TAMAMI — tip başına uzunluğu değişiyor (tarifin malzeme listesi ile vitrin
                işaretinin üç satırı aynı sütunda yaşıyor). */}
            {payload !== undefined ? (
              <div className="border-t border-ops-line pt-2">
                <PayloadTree payload={payload} />
              </div>
            ) : null}
          </>
        )}
      </div>

      {footer ? <div className="flex-none pt-1">{footer}</div> : null}
    </div>
  );
}

/**
 * "Metadata" görünümü — ham dilekçe, hedef tablolar, öneri kimliği ve varsa DOĞAN kayıtlar.
 *
 * Sonuç künyesi (`result`) dilekçenin hemen altında duruyor: ikisi birlikte okununca "ne istendi →
 * ne oluştu" zinciri tamamlanıyor ve kararın izi tek ekranda kalıyor.
 */
function MetaFace({ payload, meta }: { payload: unknown; meta?: ProposalMeta }) {
  return (
    <div className="flex flex-col gap-2">
      {meta ? (
        <span className="font-ops-body text-ops-xs text-ops-muted">
          Hedef tablolar: <span className="font-ops-mono text-ops-strong">{meta.targetTables.join(', ') || '—'}</span> · öneri:{' '}
          {/* İnsan-okunur numara YOK ve açılmadı (sözleşme §2d): sipariş referansı müşteriye söylenen
              bir numaradır, bunun muhatabı yalnız patron ve bu ekran. İlk sekiz hane anılmaya yeter. */}
          <span className="font-ops-mono text-ops-strong">{meta.id.slice(0, 8).toUpperCase()}</span>
        </span>
      ) : null}
      <pre className="m-0 whitespace-pre-wrap break-words font-ops-mono text-ops-xs leading-relaxed text-ops-strong">
        {JSON.stringify(payload, null, 2)}
      </pre>
      {meta?.result ? (
        <pre className="m-0 whitespace-pre-wrap break-words border-t border-ops-line-soft pt-2 font-ops-mono text-ops-xs leading-relaxed text-ops-strong">
          {JSON.stringify(meta.result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * Künye satırı — etiket solda sönük, değer sağda mono (fırsat kartıyla aynı okuma biçimi).
 *
 * Sapmada asistanın değeri ÜSTÜ ÇİZİLİ kalır, silinmez: "ne önerilmişti" sorusunun cevabı tam da
 * değiştirildiği anda değerlenir. Sapmasız satır (türetilmiş özet) tek değerle çizilir.
 */
function Row({ fact }: { fact: ProposalFact }) {
  const changed = fact.now != null && fact.now !== fact.value;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ops-sm text-ops-muted">{fact.label}</dt>
      <dd className="flex items-baseline gap-1.5 text-right">
        <span
          className={
            changed ? 'font-ops-mono text-ops-sm text-ops-faint line-through' : 'whitespace-nowrap font-ops-mono font-semibold text-ops-ink'
          }
        >
          {fact.value}
        </span>
        {changed ? <span className="whitespace-nowrap font-ops-mono font-semibold text-ops-violet">{fact.now}</span> : null}
      </dd>
    </div>
  );
}
