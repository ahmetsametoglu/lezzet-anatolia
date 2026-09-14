import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResolvedBatchContract, WarehouseAreaContract } from '@lezzet/types';

import { fetchWarehouseAreas, fetchWarehouseBatches, markBatchSeen } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { chooseActiveArea, useActiveAreaId } from '@/lib/operations/area-choice';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  EKRANIN KONUSU: HANGİ PARTİ (D4 · D4b) — 02.09.

  ── NEDEN TEK HOOK, İKİ EKRAN ───────────────────────────────────────────────
  Sayım ile stok düşümü aynı soruyla başlıyor ("hangi parti") ve aynı üç yolu tanıyor: raftaki
  etiketi okut · raf listesinden seç · seçtiğinden vazgeç. İki ekrana ayrı ayrı yazılsaydı arama
  gecikmesi, kırpma uyarısı ve "seçimi bırak" davranışı bir gün ayrışırdı — depocu hangi ekrandan
  geldiğine göre başka bir liste görürdü (CLAUDE §1).

  Bu hook YAZMAYI BİLMEZ: sebep, adet, not `use-adjustment`ta durur. Ayrım işlevsel — konusu henüz
  seçilmemiş bir ekranda yazma durumu taşımak, ekranın hangi hâlde olduğunu bulanıklaştırırdı.
  **Tek istisna partinin ADRESİ** (aşağıda): o yazım konunun SEÇİLME anına bağlı, kaydına değil.

  ── LİSTE ANINDA OKUNUR, ARAMA GECİKMELİ ────────────────────────────────────
  Ekran açılır açılmaz ilk pencere okunuyor: depocu karşısında bir liste bulmalı, aramaya ancak
  göremezse başvurmalı. Sonraki turlar GECİKMELİ (`SEARCH_DEBOUNCE_MS`) — her tuşta bir istek,
  rampadaki telefonda dört harflik bir aramayı dört tura çıkarırdı.

  ── GEÇ DÖNEN CEVAP YENİSİNİ EZMEZ ──────────────────────────────────────────
  Sayaçlı koruma (`generation`) okutma hook'undaki ile aynı gerekçeyle: "bakl" turu "baklava"
  turundan sonra dönerse ekranda eski liste kalırdı ve kimse bunun neden olduğunu bilemezdi.

  ── AKTİF ALAN: PARTİNİN ADRESİ SEÇİM ANINDA ÖĞRENİLİR (kullanıcı kararı 03.09) ─
  Depo içinde taşıma kaydı YOK ve olmayacak (`batch-area.ts` künyesi — tek depocunun sahası
  prosedüre dönmesin). Bunun yerine depocu "hangi dolabın önündeyim" der (`area-choice.ts`) ve o
  dolapta okuttuğu/seçtiği parti oraya yazılır. Yazım BURADA, çünkü tetikleyen olay konunun
  seçilmesidir: sayım farksız bitse de (kayıt yazılmasa da) parti orada görüldü.

  Yazım konuyu BEKLETMEZ: ekran partiyi hemen alır, adres arkadan gider; dönerse konu güncellenir,
  dönmezse bildirim çıkar. Adres yazımı sayımın önkoşulu değildir — ağ düşükken bile depocu sayar.
*/

/** Arama turları arası bekleme (ms) — parametrik, çağıran değiştirebilir. */
export const SEARCH_DEBOUNCE_MS = 300;

const t = warehouseCopy;

type SubjectStatus = 'loading' | 'error' | 'ready';

interface SubjectNotice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

export interface UseBatchSubjectResult {
  /** Ekranın KONUSU; `null` = henüz seçilmedi ve ekran seçiciyi çizer. */
  subject: ResolvedBatchContract | null;
  select: (batch: ResolvedBatchContract) => void;
  /**
   * Kayıt YAZILDIKTAN sonra çağrılır: parti aktif dolapta görüldü, adresi oraya yazılır. Seçim
   * anında değil, çünkü seçmek bir beyan değildir (kullanıcı kararı 03.09 — künye uygulamada).
   */
  markSeen: (batch: ResolvedBatchContract) => void;
  /**
   * Partinin yerini AÇIKÇA değiştirir — sayım kartındaki "değiştir" (kullanıcı kararı 03.09).
   * Depocu partiyi başka dolapta bulduysa kaydı o an düzeltir; düşüm ekranı bu kapıyı AÇMAZ.
   */
  assignArea: (batch: ResolvedBatchContract, areaId: string | null) => void;
  /** Seçimi bırakır — bağlam kartındaki "değiştir". */
  clear: () => void;
  query: string;
  setQuery: (query: string) => void;
  status: SubjectStatus;
  /** Sayfa sayfa biriken satırlar; dolap seçiliyse YALNIZ o dolabınkiler (filtre, 03.09). */
  batches: readonly ResolvedBatchContract[];
  /** Daha sayfa var mı — ekran listenin dibinde `loadMore` çağırır. */
  hasMore: boolean;
  /** Sonraki sayfa yolda — listenin ALTINDA küçük bir satır; iskelet DEĞİL (o listeyi gizler). */
  loadingMore: boolean;
  loadMore: () => void;
  reload: () => void;
  /** Deponun açık alanları — seçicinin çipleri. Boş = alan tanımsız ya da okunamadı; çip çizilmez. */
  areas: readonly WarehouseAreaContract[];
  /** Depocunun "önünde durduğum dolap" seçimi; `null` = belirtilmedi (isteğe bağlı). */
  activeAreaId: string | null;
  chooseArea: (areaId: string | null) => void;
  /** Adres yazımının sonucu — ekran toast'a verir. */
  notice: SubjectNotice | null;
}

export function useBatchSubject(): UseBatchSubjectResult {
  const [subject, setSubject] = useState<ResolvedBatchContract | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SubjectStatus>('loading');
  const [rows, setRows] = useState<readonly ResolvedBatchContract[]>([]);
  /** Sonraki sayfanın opak imleci; `null` = liste bitti (sözleşme künyesi). */
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  /** Sonraki sayfa okunuyor mu — ilk yükten AYRI: iskelet listeyi gizler, bu satır sonunda döner. */
  const [loadingMore, setLoadingMore] = useState(false);
  const [areas, setAreas] = useState<readonly WarehouseAreaContract[]>([]);
  const [notice, setNotice] = useNotice<SubjectNotice>();
  /** Elle tazeleme sayacı — "tekrar dene" aynı sorguyu yeniden koşturur. */
  const [reloadKey, setReloadKey] = useState(0);

  const chosenAreaId = useActiveAreaId();
  /*
    SEÇİM LİSTEYE KARŞI DOĞRULANIR, MUTASYONSUZ: depo değişince (çok depolu personel) eski dolabın
    kimliği yeni listede yoktur ve `null` sayılır. Seçimi silmek yerine türetmek, alan listesi henüz
    gelmemişken (boş) seçimi yanlışlıkla düşürmemek için — liste dolunca karar kendiliğinden doğru.
  */
  const activeAreaId = useMemo(
    () => (areas.some((area) => area.id === chosenAreaId) ? chosenAreaId : null),
    [areas, chosenAreaId],
  );

  const generation = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await trackWarehouse(fetchWarehouseAreas());
      if (cancelled) return;
      /* Alan listesi OKUNAMAZSA seçici çipsiz çizilir ve bu sessiz bir yutma değil, kararın
         kendisi: alan seçimi isteğe bağlıdır, yokluğu sayımı kilitlemez. Ağ arızasını raf
         listesinin kendi hata bloğu zaten söylüyor; ikinci bir uyarı aynı haberi iki kez vermekti. */
      if (result.error === null) setAreas(result.data.areas);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    // Konu seçilmişken liste okunmaz: ekran o hâlde seçiciyi çizmiyor ve arka planda tel açmak,
    // görünmeyen bir listeyi tazelemek olurdu.
    if (subject !== null) return;

    let cancelled = false;
    // İlk pencere BEKLETİLMEZ: boş sorguda gecikme, ekranı bir çeyrek saniye boş göstermek olurdu.
    const delay = query.trim().length === 0 ? 0 : SEARCH_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      void (async () => {
        const run = (generation.current += 1);
        setStatus('loading');
        /* İLK SAYFA — imleçsiz. Süzgeç (dolap) ya da terim değişince buraya dönülür ve liste
           BAŞTAN kurulur: eski sayfaların satırlarını yeni süzgecin altında bırakmak, ekranda
           süzgece uymayan satır göstermekti. */
        const result = await trackWarehouse(
          fetchWarehouseBatches({ query: query.trim(), storageAreaId: activeAreaId }),
        );
        if (cancelled || run !== generation.current) return;

        if (result.error !== null) {
          setStatus('error');
          return;
        }
        setRows(result.data.batches);
        setNextCursor(result.data.nextCursor);
        setStatus('ready');
      })();
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `activeAreaId` de bağımlılık: dolap FİLTRE (kullanıcı kararı 03.09), değişince liste baştan kurulur.
  }, [query, reloadKey, subject, activeAreaId]);

  /**
   * **SONRAKİ SAYFA** — sonsuz kaydırmanın ucu (kullanıcı bulgusu 03.09).
   *
   * Aynı anda tek tur: `loadingMore` kapıyı tutuyor, yoksa hızlı kaydıran depocu aynı imleçle üç
   * istek açar ve satırlar üç kez eklenirdi. `generation` burada da geçerli — süzgeç değişip liste
   * başa dönerse yolda olan sayfa satırlarını YENİ listeye ekleyemez.
   */
  const loadMore = useCallback(() => {
    if (nextCursor === null || loadingMore || status !== 'ready') return;
    const run = generation.current;
    setLoadingMore(true);
    void (async () => {
      const result = await trackWarehouse(
        fetchWarehouseBatches({ query: query.trim(), storageAreaId: activeAreaId, cursor: nextCursor }),
      );
      setLoadingMore(false);
      if (run !== generation.current || result.error !== null) return;
      /* Satırlar EKLENİR, kimlikle tekilleştirilerek: iki tur aynı imleci taşırsa (hızlı dokunuş,
         yeniden deneme) aynı parti listede iki kez görünmemeli. */
      setRows((current) => {
        const seen = new Set(current.map((batch) => batch.stockId));
        return [...current, ...result.data.batches.filter((batch) => !seen.has(batch.stockId))];
      });
      setNextCursor(result.data.nextCursor);
    })();
  }, [nextCursor, loadingMore, status, query, activeAreaId]);

  /*
    DOLAP SEÇİMİ ARTIK FİLTRE (kullanıcı kararı 03.09) — ve süzgeç SORGUDA, elde değil.

    Önce yalnız SIRALIYORDU ("aktif alanın partileri önde") ve gerekçesi şuydu: taşınan parti
    listeden düşerse hiç seçilemez. O gerekçe artık geçersiz — taşıma seçimle olmuyor, partinin
    kartından açıkça yapılıyor (`markSeen`). Kullanıcı da filtreyi istedi: dolabın önündeki depocu
    o dolabın listesini görmeli, başka dolabın partisi listesini kalabalıklaştırmamalı.

    Süzgeç sorguda olmak ZORUNDA: sayfa sayfa gelen bir listeyi elde süzmek, "otuz satır istedim,
    dördü ekrana geldi" demekti — sayfa boyu yalan söylerdi.

    Taşınmış parti nasıl bulunur: arama filtreden bağımsız değil ama terimi yazan depocu genelde
    filtreyi de kaldırır; kaldırmak tek dokunuş (aynı çipe ikinci dokunuş).
  */
  const batches = rows;

  /** Konuyu seçmek YALNIZCA seçmektir — adres yazımı kayda bağlı (`markSeen`, künye yukarıda). */
  const select = useCallback((batch: ResolvedBatchContract) => setSubject(batch), []);

  /**
   * **KAYIT YAZILDIKTAN SONRA çağrılır: parti bu alanda görüldü.**
   *
   * Tetikleyici SEÇİM değil KAYITTIR (kullanıcı kararı 03.09) ve bu bir güvenlik kararı. Eskiden
   * adres seçim anında yazılıyordu: depocu dolabı seçip listeden başka alandaki bir partiye
   * dokunduğu anda o partinin yeri SESSİZCE değişiyordu — liste süzülmediği için yanlış satıra
   * dokunmak yeterliydi ve bildirim rampada okunmuyor. *"Sayacağım partiyi seçmek"* ile *"bu
   * partinin yerini değiştirmek"* tek dokunuşa binmişti; iki ayrı iş, tek eylem.
   *
   * Sayım/düşüm kaydı ise bir BEYANDIR: depocu o dolabın önünde saydığını söylüyor. Vazgeçen,
   * yanlış partiye dokunup geri dönen, ekranı terk eden hiçbir şeyi değiştirmez.
   */
  const assignArea = useCallback(
    (batch: ResolvedBatchContract, areaId: string | null) => {
      if (areaId === null || batch.storageAreaId === areaId) return;

      void (async () => {
        const result = await trackWarehouse(markBatchSeen(batch.stockId, areaId));
        if (result.error !== null) {
          setNotice({ tone: 'warn', text: t.adjustment.area.writeFailed });
          return;
        }
        const outcome = result.data;
        if (outcome.status === 'ok') {
          // Konu HÂLÂ aynı partiyse adresi güncelle — depocu bu arada başka partiye geçtiyse
          // onun kartına yabancı bir adres yazılmaz.
          setSubject((current) =>
            current !== null && current.stockId === batch.stockId
              ? { ...current, storageAreaId: areaId, storageAreaName: outcome.storageAreaName }
              : current,
          );
          if (outcome.changed) {
            setNotice({ tone: 'ok', text: fillCopy(t.adjustment.area.moved, { area: outcome.storageAreaName }) });
          }
          return;
        }
        if (outcome.status === 'invalid_area') {
          // Dolap bu depoda yok ya da kapatılmış: seçim düşürülür ki bir sonraki parti de aynı
          // duvara çarpmasın; sebebi söylenir.
          chooseActiveArea(null);
          setNotice({ tone: 'warn', text: t.adjustment.area.invalid });
          return;
        }
        setNotice({ tone: 'error', text: outcome.status === 'forbidden' ? t.common.outOfScope : t.common.notFound });
      })();
    },
    [setNotice],
  );

  /** Kayıttan sonra: parti AKTİF dolapta görüldü. `assignArea`nın özel hâli (künye yukarıda). */
  const markSeen = useCallback(
    (batch: ResolvedBatchContract) => assignArea(batch, activeAreaId),
    [assignArea, activeAreaId],
  );

  /**
   * Seçimi bırakırken ARAMA DA SIFIRLANIR: depocu bir partiyi bırakıyorsa aradığı başkasıdır ve
   * eski terimin süzdüğü listeye dönmek, "listede yok" izlenimi verirdi.
   */
  const clear = useCallback(() => {
    setSubject(null);
    setQuery('');
  }, []);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  /** Aynı çipe ikinci dokunuş BIRAKMADIR — "hiçbirinin önünde değilim" için ayrı çip yok. */
  const chooseArea = useCallback(
    (areaId: string | null) => chooseActiveArea(areaId === activeAreaId ? null : areaId),
    [activeAreaId],
  );

  return {
    subject,
    select,
    markSeen,
    assignArea,
    clear,
    query,
    setQuery,
    status,
    batches,
    hasMore: nextCursor !== null,
    loadingMore,
    loadMore,
    reload,
    areas,
    activeAreaId,
    chooseArea,
    notice,
  };
}
