'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CustomerType } from '@lezzet/types';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import type { OrderSummaryView } from '@/lib/order/summary';
import {
  loadMoreCustomersAction,
  readCustomerDetailAction,
  readB2bCheckAction,
  readOrderSummaryAction,
  setB2bApprovalAction,
  setCustomerCreditAction,
  updateCustomerAction,
} from './actions';
import { B2bApprovalDialog } from './components/b2b-approval-dialog';
import { CreditDialog } from './components/credit-dialog';
import { CustomerEditDialog } from './components/customer-edit-dialog';
import { OrderDialog } from './components/order-dialog';
import { CustomersDesktop } from './customers.desktop';
import { customersUrl, type CustomerScope, type CustomersUrlState, type MarketingChannelFilter } from './customers-url';
import type {
  B2bCheckView,
  CreditFormInput,
  CustomerDetail,
  CustomerEditInput,
  CustomerRow,
  CustomersData,
} from './customers-types';

// Müşteri ekranı client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız; mobil deneyim
// native uygulamada (`docs/uygulama`).
//
// SÜZGEÇ AKIŞI: süzgeç bir client durumu DEĞİL, URL durumudur — kullanıcı değiştirince URL yazılır →
// RSC yeniden okur → süzülmüş İLK SAYFA gelir. **Burada client-side filtreleme YOK** ve bu, fiyat/stok
// ekranlarının 09.17'de teşhis edilen hatasından bilinçli sapma: orada client süzgeci `router.replace`
// ile yazılıyor ve yüklenmiş sayfaları siliyor. Buradaki her süzgeç bir KOLON, yani sunucuya ait.

interface CustomersClientProps {
  data: CustomersData;
  urlState: CustomersUrlState;
}

export function CustomersClient({ data, urlState }: CustomersClientProps) {
  const router = useRouter();

  /**
   * Süzgeç turu SÜRÜYOR MU. `router.replace` bir RSC okumasıdır (liste + sayaçlar + gecikme kümesi =
   * üç paralel sorgu) ve dönene kadar ekranda hiçbir karşılık yoktu: liste eski satırlarla duruyor,
   * tıklanan çip bile aktifleşmiyordu — aktiflik `urlState`'ten, yani sunucudan geliyor. Operatör
   * bastığının işleyip işlemediğini anlayamıyordu (bağımsız ajan denetimi, 30.07).
   */
  const [pending, startNav] = useTransition();

  /** Süzgeç değişimi: URL'e yaz + RSC'yi yeniden okut (süzülmüş ilk sayfa gelir). */
  const applyFilters = (patch: Partial<CustomersUrlState>) => {
    startNav(() => router.replace(customersUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  // Arama: giriş yerel (anında yazılır), URL'e gecikmeli — mekanizma ortak (`useSearchDraft`).
  const { draft: search, onDraft: onSearch } = useSearchDraft(urlState.q, (q) => applyFilters({ q }));

  // ── Liste: ilk sayfa sunucudan, devamı action ile EKLENİR ──
  // Sunucu verisi değişince (süzgeç/revalidate) eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin
  // satırları yeni listede kalır.
  const [extra, setExtra] = useState<CustomerRow[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  /**
   * Yazma sonrası yerelde güncellenen satır alanları — kimlik → yama (bkz. aşağıdaki `runWrite`).
   *
   * Bildirimi BURADA, `rows`'tan önce: `rows` bir `.map` ile hemen hesaplanıyor ve yamayı okuyor.
   * Aşağıda dursa çalışma zamanında `Cannot access 'rowPatch' before initialization` verirdi —
   * tip denetimi bunu görmedi çünkü okuma bir kapanışın (`.map` geri çağrısı) içindeydi ve TS
   * kapanışları "sonra çalışabilir" sayıp geçiyor. Yaşandı (30.07).
   */
  const [rowPatch, setRowPatch] = useState<Record<string, Partial<CustomerRow>>>({});
  useEffect(() => {
    setExtra([]);
    setCursor(data.nextCursor);
    setRowPatch({});
  }, [data.rows, data.nextCursor]);

  // Sunucu satırları + eklenen sayfalar, üstüne yerel yamalar. Yama SUNUCU verisi gelince düşer
  // (`rowPatch` sıfırlanır) — kalıcı bir gölge kopya tutulmuyor.
  const rows = [...data.rows, ...extra].map((r) => (rowPatch[r.id] ? { ...r, ...rowPatch[r.id] } : r));

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreCustomersAction(window.location.search, cursor)
      .then(({ data: page }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        // BEKLEYEN(09.17): düşen sayfa isteği loglanacak — sessiz kalması 09.17'de bir imleç hatasını
        // aylarca gizledi. İşaret 18.5'i gösteriyordu; o görev KAPANDI ve kapsamında istemci tarafını
        // bilinçle dışladı — kapanmış göreve asılı bir işaret hiçbir zaman ele alınmaz.
        if (!page) return;
        setExtra((prev) => [...prev, ...page.rows]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  // ── Seçim ve seçilinin türetilmiş bilgisi ──
  // Seçim KİMLİKLE tutulur; kayıt taze listeden türetilir (kopya tutulursa güncelleme yansımaz).
  // İlk satır kendiliğinden seçilmez, panel "seç" der — bir müşterinin ödeme bilgisini istemeden
  // ekrana getirmek bu ekranda uygun değil.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /**
   * Detay okuması DÜŞTÜYSE sebebi.
   *
   * Bir tur bu hata YUTULUYORDU (`if (iptal || !d) return;` — `error` hiç okunmuyordu) ve sonucu
   * sessiz bir yalandı: `detailLoading` false'a dönüyor, `detail` null kalıyor ve panel elindeki boş
   * hâlleri gösteriyordu — "Son siparişler: Henüz siparişi yok." Müşterinin 38 siparişi olabilir;
   * ekran onları olmadığına ikna ediyordu. Aynı dosyadaki diğer iki okuma (sipariş özeti, B2B kartı)
   * hatayı zaten yüzeye çıkarıyordu; bu okuma o desenden sapmıştı (bağımsız ajan denetimi, 30.07).
   */
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    // Seçim değişince ESKİ detay hemen düşer: kalması, yeni müşterinin altında başkasının cirosunu
    // göstermek olurdu — bir an için bile kabul edilemez.
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    let iptal = false;
    void readCustomerDetailAction(selectedId)
      .then(({ data: d, error }) => {
        // Hızlı tıklamada yarış: yalnız SON seçimin cevabı yazılır.
        if (iptal) return;
        if (d) setDetail(d);
        else setDetailError(error ?? 'Müşteri bilgisi okunamadı.');
      })
      .finally(() => {
        if (!iptal) setDetailLoading(false);
      });
    return () => {
      iptal = true;
    };
  }, [selectedId]);

  // Seçili satır listeden düştüyse (süzgeç değişti) seçim de düşer — boş panele bakılmaz.
  useEffect(() => {
    if (selectedId && !rows.some((r) => r.id === selectedId)) setSelectedId(null);
  }, [selectedId, rows]);

  // Seçili KAYIT taze listeden türetilir, kopya tutulmaz: düzenleme sonrası RSC tazelendiğinde
  // diyalog eski adı göstermez.
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // ── Sipariş özeti diyaloğu ──
  // Kimlik tutulur, kopya değil; referans karttan gelir ki başlık okuma bitmeden de doğru yazsın.
  const [orderDialog, setOrderDialog] = useState<{ id: string; referenceNo: string | null } | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummaryView | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderDialog) {
      setOrderSummary(null);
      return;
    }
    setOrderSummary(null);
    setOrderError(null);
    let iptal = false;
    void readOrderSummaryAction(orderDialog.id).then(({ data: s, error }) => {
      if (iptal) return;
      // Hata YUTULMAZ: yutulsa diyalog sonsuza kadar "Yükleniyor…" kalır ve kullanıcı ne olduğunu
      // hiç öğrenmez (bu oturumda tam bu desen bir imleç hatasını aylarca gizledi).
      if (s) setOrderSummary(s);
      else setOrderError(error ?? 'Sipariş özeti okunamadı.');
    });
    return () => {
      iptal = true;
    };
  }, [orderDialog]);

  // ── Yazma akışı ──
  // Yazmadan sonra seçili müşterinin detayı yeniden okunur ve SATIR YERELDE yamalanır.
  //
  // **`router.refresh()` BİLİNÇLİ OLARAK ÇAĞRILMIYOR.** Çağrılsaydı RSC yeni bir `data.rows` üretir,
  // sıfırlama etkisi yüklenmiş sayfaları siler ve seçili müşteri ilk 30 satırda değilse SEÇİM DE
  // düşerdi: üçüncü sayfadaki bir müşterinin kapıda ödeme iznini kapatan operatör panelini kaybedip
  // listenin başına dönerdi. 09.17'de teşhis edilen hatanın aynısı, bu kez süzgeç değil yazma
  // tetikleyicisiyle.
  //
  // Karşılığında sayaçlar bayatlamıyor: başlıktaki üç sayı (toplam · taslak · gecikmiş vade) bu
  // ekrandan yazılan hiçbir alana bağlı değil — vade yetkisi, kapıda ödeme ve indirim oranı üçünü de
  // oynatmaz. Satırda değişebilen tek şey "Vadeli" rozeti; onu taze detaydan yamalıyoruz.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const runWrite = async (fn: () => Promise<{ error: string | null }>, onDone?: () => void) => {
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await fn();
      if (error) {
        // Hata SESSİZ DEĞİL: düşen bir kaydetme, operatörün yazdığını sandığı bir limittir.
        setSaveError(error);
        return;
      }
      if (selectedId) {
        const { data: fresh } = await readCustomerDetailAction(selectedId);
        if (fresh) {
          setDetail(fresh);
          // Satırın rozetini besleyen alanlar taze detaydan gelir; liste yeniden okunmadan doğru olur.
          setRowPatch((prev) => ({ ...prev, [selectedId]: { creditEnabled: fresh.creditEnabled } }));
        }
      }
      onDone?.();
    } finally {
      setSaving(false);
    }
  };

  const [creditOpen, setCreditOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // ── B2B kontrol kartı ──
  // Kart SEÇİMLE değil DİYALOG AÇILINCA okunur: dört okuma (profil, adres, teslim bölgeleri, mükerrer
  // adayları) yalnız şirket müşterisinde ve yalnız operatör başvuruyu inceleyeceği zaman anlamlı.
  const [b2bOpen, setB2bOpen] = useState(false);
  const [b2bCheck, setB2bCheck] = useState<B2bCheckView | null>(null);
  const [b2bError, setB2bError] = useState<string | null>(null);

  useEffect(() => {
    if (!b2bOpen || !selectedId) {
      setB2bCheck(null);
      return;
    }
    setB2bCheck(null);
    setB2bError(null);
    let iptal = false;
    void readB2bCheckAction(selectedId).then(({ data: c, error }) => {
      if (iptal) return;
      // Hata YUTULMAZ: yutulsa kart sonsuza kadar "okunuyor…" kalırdı.
      if (c) setB2bCheck(c);
      else setB2bError(error ?? 'Kontrol kartı okunamadı.');
    });
    return () => {
      iptal = true;
    };
  }, [b2bOpen, selectedId]);

  const onOpenOrder = (orderId: string) => {
    const row = detail?.lastOrders.find((o) => o.id === orderId);
    setOrderDialog({ id: orderId, referenceNo: row?.referenceNo ?? null });
  };

  const view = {
    data,
    rows,
    urlState,
    search,
    onSearch,
    onScope: (scope: CustomerScope) => applyFilters({ scope }),
    onType: (type: CustomerType | 'all') => applyFilters({ type }),
    // Kanal daraltması kendi başına bir daraltma DEĞİL, `marketing` kümesinin içindeki bir ayrım —
    // bu yüzden hep `scope` ile birlikte yazılır: bir bağlantıdan `?scope=marketing&mc=email` ile
    // gelinip çipe basıldığında kapsamın da yerinde kalması gerekiyor.
    onChannel: (mc: MarketingChannelFilter) => applyFilters({ scope: 'marketing', mc }),
    navPending: pending,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    selectedId,
    onSelect: setSelectedId,
    detail,
    detailLoading,
    detailError,
    onOpenOrder,
    onEditCredit: () => {
      setSaveError(null);
      setCreditOpen(true);
    },
    onEdit: () => {
      setSaveError(null);
      setEditOpen(true);
    },
    onOpenB2b: () => {
      setSaveError(null);
      setB2bOpen(true);
    },
    saving,
    saveError,
  };

  return (
    <>
      <CustomersDesktop {...view} />
      {creditOpen && selected && detail ? (
        <CreditDialog
          key={`credit-${selected.id}`}
          customerName={selected.name}
          detail={detail}
          saving={saving}
          error={saveError}
          onSave={(input: CreditFormInput) =>
            void runWrite(() => setCustomerCreditAction(selected.id, input), () => setCreditOpen(false))
          }
          onClose={() => setCreditOpen(false)}
        />
      ) : null}
      {editOpen && selected && detail ? (
        <CustomerEditDialog
          key={`edit-${selected.id}`}
          row={selected}
          vatNumber={selected.vatNumber}
          preferredLanguage={selected.preferredLanguage}
          codAllowed={detail.codAllowed}
          discountPercent={detail.discountPercent}
          saving={saving}
          error={saveError}
          onSave={(input: CustomerEditInput) =>
            void runWrite(
              async () => {
                const sonuc = await updateCustomerAction(selected.id, input);
                if (!sonuc.error) {
                  // Kimlik alanları detayda taşınmıyor (satırın malı) — yamayı buradan yazıyoruz ki
                  // liste yeniden okunmadan yeni ad görünsün.
                  setRowPatch((prev) => ({
                    ...prev,
                    [selected.id]: { ...prev[selected.id], name: input.name.trim(), phone: input.phone, email: input.email, type: input.type, country: input.country, preferredLanguage: input.preferredLanguage, vatNumber: input.vatNumber },
                  }));
                }
                return sonuc;
              },
              () => setEditOpen(false),
            )
          }
          onClose={() => setEditOpen(false)}
        />
      ) : null}
      {b2bOpen && selected ? (
        <B2bApprovalDialog
          key={`b2b-${selected.id}`}
          check={b2bCheck}
          error={b2bError}
          saving={saving}
          onDecide={(approved, reason) =>
            void runWrite(
              async () => {
                const sonuc = await setB2bApprovalAction(selected.id, approved, reason);
                if (!sonuc.error) {
                  // Satır rozeti `b2bStatus`'a bağlı; liste yeniden okunmadan doğru olsun diye
                  // yerelde yamalanıyor (`router.refresh()` seçimi düşürürdü). Ret'in karşılığı
                  // `rejected` — `pending` yazsaydık az önce verdiğimiz karar ekranda hiç olmamış
                  // gibi görünürdü.
                  setRowPatch((prev) => ({
                    ...prev,
                    [selected.id]: { ...prev[selected.id], b2bStatus: approved ? 'approved' : 'rejected' },
                  }));
                }
                return sonuc;
              },
              () => setB2bOpen(false),
            )
          }
          onClose={() => setB2bOpen(false)}
        />
      ) : null}
      {orderDialog ? (
        <OrderDialog
          key={orderDialog.id}
          summary={orderSummary}
          error={orderError}
          referenceNo={orderDialog.referenceNo}
          onClose={() => setOrderDialog(null)}
        />
      ) : null}
    </>
  );
}
