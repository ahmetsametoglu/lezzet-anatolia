'use client';

import { useCallback, useMemo } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { FieldShell } from '@/components/operation/form/field-shell';
import { Select } from '@/components/operation/form/select';
import { Toggle } from '@/components/operation/form/toggle';
import { num } from '@/components/operation/ui/format';
import { placesLabel } from '@/components/operation/ui/labels';
import { ZoneMap } from '@/components/operation/ui/zone-map';
import { keyOfPoint, type ZoneCodeState, type ZoneMapPoint } from '@/components/operation/ui/zone-map-model';
import { zoneCodeKey, zoneSummary, type ZoneCandidateCode, type ZoneFormValues } from './schema';

/**
 * **BÖLGE GENİŞLETME GÖVDESİ** — kuyruğun içinde, harita ile (22.36).
 *
 * ── NEDEN HARİTA ŞARTTI ─────────────────────────────────────────────────────
 * Bu tip uzun süre `handoff` modundaydı ve gerekçesi `kind-meta`da yazılıydı: *"hangi kod girsin
 * sorusu haritasız cevaplanamaz."* Gerekçe doğruydu — bir posta kodunu bölgeye almak COĞRAFİ bir
 * karardır, operatör kodu değil YOLU bilir. Bu yüzden mod `inline`a geçerken harita da geldi;
 * haritasız bir gövde, kararı diyaloğa taşıyıp kararın dayanağını dışarıda bırakmak olurdu.
 *
 * Harita rota sayfasınınkiyle AYNI bileşen (`ZoneMap`) ve aynı hâl sözlüğü: operatör iki ekranda
 * aynı renkleri okur. Fark yalnız kapsam — burada boştaki kodların keşfi YOK (okuması
 * `zone-proposal-map` künyesinde gerekçeli).
 *
 * ── SEÇİM İKİ YOLDAN ────────────────────────────────────────────────────────
 * Haritadan tıklayarak ya da listedeki anahtardan. İkisi aynı değeri yazıyor; liste kanıtları
 * (kaç istek, kaç bekleyen) taşıdığı için karar orada veriliyor, harita ise "nerede" sorusunu
 * cevaplıyor — rota sayfasının kendi ayrımının aynısı.
 */
interface ZoneFormBodyProps {
  values: ZoneFormValues;
  onChange: (next: ZoneFormValues) => void;
  /** Dilekçenin önerdiği kodlar — form YALNIZ bunları düzenletir. */
  candidates: readonly ZoneCandidateCode[];
  /** SEÇİLİ rotanın bugünkü kodları — haritada "bu rotanın kodu" olarak çizilir. */
  currentCodes: ReadonlyArray<{ country: ZoneCandidateCode['country']; postalCode: string }>;
  /** Haritanın çizeceği tüm noktalar (bölge kodları + öneriler + başka bölgelerinkiler). */
  points: readonly ZoneMapPoint[];
  /** Kodu SEÇİLİ rotadan başkası tutuyorsa `stateOf` onu `taken` çizsin diye. */
  heldKeys: ReadonlySet<string>;
  /** Seçilebilecek rotalar — hepsi, deposuyla birlikte (kullanıcı tespiti 15.08). */
  routes: ReadonlyArray<{ id: string; name: string; warehouseName: string | null; codeCount: number }>;
  warehouseName: string | null;
  disabled: boolean;
}

export function ZoneFormBody({
  values,
  onChange,
  candidates,
  currentCodes,
  points,
  heldKeys,
  routes,
  warehouseName,
  disabled,
}: ZoneFormBodyProps) {
  const zoneName = routes.find((route) => route.id === values.zoneId)?.name ?? '—';
  const chosen = useMemo(() => new Set(values.selectedKeys), [values.selectedKeys]);
  const summary = zoneSummary(values, candidates);

  // Aday anahtarları: haritada öneriyi `suggested` çizebilmek için — henüz seçilmemiş olanlar mor
  // kalır, seçilenler yeşile döner. Rengin değişmesi operatöre kararının haritadaki karşılığını
  // gösteriyor; liste ile harita arasında ikinci bir okuma gerekmiyor.
  const candidateKeys = useMemo(() => new Set(candidates.map(zoneCodeKey)), [candidates]);
  const currentKeys = useMemo(() => new Set(currentCodes.map(zoneCodeKey)), [currentCodes]);

  /**
   * **HARİTA KARARIN ÜSTÜNE AÇILIR** — merkez, bu diyalogda tartışılan kodların ortalaması.
   *
   * `ZoneMap`in varsayılan merkezi Strasbourg (`48.583, 7.75`) ve rota sayfası için doğru: orada
   * operatör zaten haritayı gezdiriyor. Diyalogda ise gezinme YOK — harita 260 piksellik bir kart
   * ve tek işi "bu kodlar nerede" demek. Merkez verilmeseydi Colmar'a ya da Kehl'e ait bir bölge
   * önerisi Strasbourg'a bakan bir haritayla açılır, tartışılan noktalar kadrajın dışında kalırdı;
   * operatör boş bir harita görüp öneriyi "yersiz" sanabilirdi.
   *
   * Ortalama SEÇİLEBİLİR kodlardan alınıyor (bölgenin kendi kodları + adaylar), başka rotanınkiler
   * dışarıda: kadrajı ilgisiz bir güzergâha doğru çekmesinler.
   */
  const center = useMemo(() => {
    const focus = points.filter((point) => {
      const key = keyOfPoint(point);
      return currentKeys.has(key) || candidateKeys.has(key);
    });
    if (focus.length === 0) return undefined;
    return {
      lat: focus.reduce((sum, p) => sum + p.lat, 0) / focus.length,
      lng: focus.reduce((sum, p) => sum + p.lng, 0) / focus.length,
    };
  }, [candidateKeys, currentKeys, points]);

  const toggle = useCallback(
    (key: string) => {
      if (disabled) return;
      // Başka bölgenin tuttuğu kod SEÇİLEMEZ: kural veritabanında (bir kod tek bölgede) ve burada
      // yeniden uygulanmıyor — yalnız reddedilecek bir seçimin önü kesiliyor ki operatör "onayla"ya
      // basıp kısıt ihlaliyle karşılaşmasın.
      if (heldKeys.has(key)) return;
      const next = chosen.has(key) ? values.selectedKeys.filter((k) => k !== key) : [...values.selectedKeys, key];
      onChange({ ...values, selectedKeys: next });
    },
    [chosen, disabled, heldKeys, onChange, values.selectedKeys],
  );

  const stateOf = useCallback(
    (point: ZoneMapPoint): ZoneCodeState => {
      const key = keyOfPoint(point);
      /**
       * **SIRA VE AYRIM — kullanıcının ekranda gördüğü kusurun düzeltmesi (15.08).**
       *
       * Önce `chosen` da `mine` dönüyordu ve sonuç şuydu: *"hangi nokta eski, hangisi yeni seçilen
       * karışıyor."* Bölgenin yıllardır taşıdığı kod ile bu diyalogda az önce eklenen kod aynı
       * yeşil noktaydı, yani KARARIN KENDİSİ haritada görünmüyordu.
       *
       * Artık üç ayrı hâl: bölgenin kodu (`mine`) · bu kararla eklenen (`adding`) · henüz kabul
       * edilmemiş öneri (`suggested`). `adding` önce sorulur, çünkü seçilen bir kod aynı zamanda
       * adaydır — aday dalına düşseydi seçim yine görünmezdi.
       */
      if (currentKeys.has(key)) return 'mine';
      if (chosen.has(key)) return 'adding';
      if (heldKeys.has(key)) return 'taken';
      return candidateKeys.has(key) ? 'suggested' : 'free';
    },
    [candidateKeys, chosen, currentKeys, heldKeys],
  );

  return (
    <div className="flex flex-col gap-3">
      {/**
       * **HEDEF ROTA — kararın ilk sorusu, o yüzden en üstte** (kullanıcı tespiti 15.08).
       *
       * Gövde ilk yazımda bu seçiciyi hiç taşımıyordu: dilekçe hangi rotayı işaret ediyorsa kod
       * ona giriyordu. Kullanıcı ekranda gördü — *"belki de bu posta kodunu farklı rotaya atamak
       * istiyorum, belki farklı depoya"* — ve haklıydı: asistanın rota seçimi bir ÖNERİDİR.
       * `delivery_map` en yakın güzergâhı bulur ama hangi aracın o kodu taşıyacağı operatörün
       * bilgisidir (kapasite, sürücü, gün).
       *
       * Seçenek etiketi DEPOYU da yazıyor, çünkü "farklı depoya ver" kararı buradan veriliyor:
       * rota kendi deposuna bağlı, dolayısıyla başka deponun rotasını seçmek kodu o depoya
       * bağlamaktır. Ayrı bir depo seçicisi rotasız bir atama doğururdu ve öyle bir kayıt yok.
       */}
      <FieldShell
        label="Hangi rotaya girsin"
        required
        labelAside={values.zoneId ? `${num(currentCodes.length)} kod` : undefined}
      >
        <Select
          value={values.zoneId}
          onChange={(zoneId) => onChange({ ...values, zoneId })}
          placeholder="Rota seçin"
          disabled={disabled}
          options={routes.map((route) => ({
            value: route.id,
            label: `${route.name}${route.warehouseName ? ` · ${route.warehouseName}` : ''} — ${route.codeCount} kod`,
          }))}
        />
      </FieldShell>

      {/* Harita SABİT yükseklikte: `flex-1` verilseydi kutu içeriğe göre büyüyüp küçülür, kod
          listesi uzadıkça harita ezilirdi.
          630px — kullanıcı iki kez ölçtü: önce *"yüksekliği kötü"* (260 → 420), sonra *"bir buçuk
          kat daha arttır"* (420 → 630). Harita bir ORAN işidir; 1600 piksellik diyalogda sol sütun
          ~1100 piksel ve altındaki bir şerit bant gibi duruyordu. Karar coğrafi olduğu için
          haritanın kendisi ekranın baskın öğesi olmalı — kod listesi onun SONUCU. */}
      <div className="h-[630px] overflow-hidden rounded-ops-card border border-ops-line">
        <ZoneMap
          points={points}
          stateOf={stateOf}
          onPick={(point) => toggle(keyOfPoint(point))}
          center={center}
          note={`${zoneName}${warehouseName ? ` · ${warehouseName}` : ''} — önerilen kodlar mor; tıklayınca bölgeye girer.`}
        />
      </div>

      <FieldShell label="Önerilen posta kodları" labelAside={`${num(summary.selected)}/${num(candidates.length)} seçili`}>
        <div className="flex flex-col rounded-ops-card border border-ops-line">
          {candidates.map((code) => {
            const key = zoneCodeKey(code);
            const held = code.heldBy !== null;
            return (
              <div
                key={key}
                className="flex items-center gap-2.5 border-b border-ops-line-soft px-2.5 py-2 last:border-b-0"
              >
                {/* `onChange` VERİLMEZSE anahtar dekoratif olur (künyesi: tıklama yutulmaz, el
                    işareti kaybolmaz) — kilitli hâlin doğru ifadesi bu; ayrı bir `disabled`
                    bayrağı yok ve uydurulmuyor. */}
                <Toggle on={chosen.has(key)} onChange={disabled || held ? undefined : () => toggle(key)} />
                <span className="font-ops-mono text-ops-xs text-ops-ink">{code.postalCode}</span>
                <span className="truncate font-ops-body text-ops-xs text-ops-muted">
                  {placesLabel(code.places, 2) ?? '—'}
                </span>
                {/* Bekleyen SIFIRSA rozet çizilmez: her satıra "0 bekliyor" yazmak, gerçekten
                    bekleyeni olan satırı gürültünün içinde kaybederdi (ağırlık rayının kuralı). */}
                {code.waitingCount > 0 ? <Badge tone="blue">{num(code.waitingCount)} bekliyor</Badge> : null}
                <span className="ml-auto shrink-0 font-ops-body text-ops-xs text-ops-muted">
                  {num(code.requestCount)} istek
                </span>
                {held ? <Badge tone="slate">{code.heldBy}</Badge> : null}
              </div>
            );
          })}
        </div>
      </FieldShell>

      {/**
       * **GERİ ALINAMAZ ETKİ, SEÇİME BAĞLI SAYIYLA.**
       *
       * Cümlenin iskeleti sabit ve asistan onu değiştiremez; sayı seçimden okunuyor. İkisinin ayrı
       * durması bilinçli (`kind-meta` künyesi aynı ayrımı yazıyor): sabit bir "bildirim gider"
       * cümlesi bekleyeni olmayan seçimde YALAN söylerdi, cümleyi tümüyle modele bırakmak ise geri
       * alınamaz bir etkiyi yumuşatan bir metin yazmasına izin verirdi.
       */}
      {summary.waiting > 0 ? (
        <p className="rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-3 py-2 font-ops-body text-ops-sm text-ops-amber-dark">
          Şu seçimle <strong className="font-semibold">{num(summary.waiting)} müşteriye</strong> “bölgeniz açıldı”
          bildirimi gider — <strong className="font-semibold">geri alınamaz.</strong> Bölgeyi sonra kapatsanız bile
          mesaj gitmiş olur.
        </p>
      ) : (
        <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
          Şu seçimde haber bekleyen müşteri yok — onay bildirim göndermez, yalnız kodları bölgeye ekler.
        </p>
      )}

      {summary.blocked > 0 ? (
        <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-muted">
          {num(summary.blocked)} önerilen kod başka bir rotada tanımlı ve seçilemiyor — bir kod yalnız tek bölgede
          olabilir. Taşımak gerekiyorsa önce o rotadan çıkarılmalı (Teslimat &amp; Rota ekranı).
        </p>
      ) : null}
    </div>
  );
}
