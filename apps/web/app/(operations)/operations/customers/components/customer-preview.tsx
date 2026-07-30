'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { InlineMetric } from '@/components/operation/ui/inline-metric';
import { Metric } from '@/components/operation/ui/metric';
import { money, percent, shortDate } from '@/components/operation/ui/format';
import { paymentTone, statusHint, statusOf, typeTone } from '../customers-labels';
import { TYPE_LABEL } from '../customers-url';
import type { ConsentView, CustomerDetail, CustomerOrderRow, CustomerRow } from '../customers-types';

/**
 * Seçili müşterinin önizleme paneli (web) — tasarımdaki "Müşteri · önizleme".
 *
 * **Yerleşim KART ritmindedir**, kenardan kenara şerit değil: panelin zemini `ops-subtle`, her blok
 * beyaz bir kart, aralarında boşluk var. Bir tur şerit olarak yazılmıştı ve panel tek parça bir
 * listeye dönüşüyordu — bloklar arası nefes tasarımın kendi kararı (ürün önizlemesinin deseni).
 *
 * **PANEL OKUR, YAZMAZ** (kullanıcı kararı 30.07 + tasarım): kapıda ödeme ve indirim oranı burada
 * yalnız BİLGİ — anahtar ve yüzde kutusu `Düzenle` formuna taşındı. Bir tur panele gömülmüşlerdi ve
 * iki sorunu vardı: (1) tasarımda o iki kutu salt görünüm, (2) diyalogsuz yazma "kaydettim mi?"
 * sorusunu doğuruyordu — panelde onaylanacak bir form yok, tıklama anında yazıyordu. Panelin tek
 * yazma yolu artık iki düğme: `Düzenle` ve `Vade / limit`.
 *
 * Türetilmiş değerler HİÇ düzenlenmez: ciro, açık bakiye, puan bakiyesi, gecikme ve karne elle
 * düzeltilemez — kaynağı düzeltilir (tasarım §6).
 *
 * **Pazarlama izni yalnız görüntülenir.** İzin müşterinin açık eylemiyle doğar; admin elle "verildi"
 * yapamaz, aksi GDPR kanıtını bozar (tasarım §6).
 *
 * Sayı kutusu ORTAK (`Metric`): bir tur bu dosyada `Kpi`, mobilde `MobileKpi`, diyalogda `Fact`
 * olarak üç kez yazılmıştı ve üçü aynı sayıyı üç farklı boyda gösteriyordu (CLAUDE.md §1).
 */
interface CustomerPreviewProps {
  row: CustomerRow | null;
  detail: CustomerDetail | null;
  loading: boolean;
  saving: boolean;
  /**
   * Son yazma hatası — GÖSTERİLMEK ZORUNDA: sessizce düşen bir kaydetme, operatörün yazdığını
   * sandığı bir limittir. Diyalog kapandıktan sonra düşen bir hatanın tek durağı bu şerit.
   */
  saveError: string | null;
  onOpenOrder: (orderId: string) => void;
  onEditCredit: () => void;
  onEdit: () => void;
  /** B2B kontrol kartı diyaloğu — yalnız şirket müşterisinde gösterilir. */
  onOpenB2b: () => void;
}

export function CustomerPreview({
  row,
  detail,
  loading,
  saving,
  saveError,
  onOpenOrder,
  onEditCredit,
  onEdit,
  onOpenB2b,
}: CustomerPreviewProps) {
  if (!row) {
    return (
      <div className="flex flex-1 items-center justify-center bg-ops-subtle p-10 text-center font-ops-body text-ops-base text-ops-faint">
        Soldan bir müşteri seçin.
      </div>
    );
  }

  const status = statusOf(row);
  // Gecikme kutunun RENGİNİ belirler: olive "yolunda", kırmızı "para bekliyor". Zeminsiz bir vade
  // kutusu, tasarımın en çok anlam yüklediği yeri sessiz bırakırdı.
  const gecikme = (detail?.overdueCount ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-ops-subtle">
      {/* Başlık SABİT: panel kaydırılırken "hangi müşteriye bakıyorum" ekrandan çıkmamalı. */}
      <div className="sticky top-0 z-[1] flex items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-5 py-3">
        <span className="mr-auto font-ops-display text-ops-micro font-medium uppercase tracking-[0.1em] text-ops-muted">
          Müşteri · önizleme
        </span>
        <Badge tone="neutral">salt görünüm</Badge>
      </div>

      <div className="flex flex-col gap-3.5 px-5 py-4">
        {/* ── Kimlik ── */}
        <div className="flex items-start gap-3">
          {/* Avatar YUVARLATILMIŞ KARE ve tipe göre DOLU renkli: kanal ilk bakışta okunur. */}
          <span
            className={`flex h-11 w-11 flex-none items-center justify-center rounded-[11px] font-ops-display text-ops-base font-semibold text-ops-white ${
              row.type === 'company' ? 'bg-ops-amber' : 'bg-ops-olive'
            }`}
          >
            {row.initials}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-ops-display text-ops-lead font-semibold text-ops-ink">{row.name}</span>
            {/* Telefon MONO: kimlik anahtarı ve gözle karşılaştırılıyor. */}
            <span className="truncate font-ops-mono text-ops-xs text-ops-muted">
              {row.phone ?? row.email ?? 'iletişim bilgisi yok'} · {row.country}
            </span>
            {/* Rozetler adın ALTINDA, sola hizalı — satırın sağ ucuna atılmaları tasarımda yok. */}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={typeTone(row.type)}>{TYPE_LABEL[row.type]}</Badge>
              <span title={statusHint(row)}>
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
              </span>
            </div>
          </div>
        </div>

        {/* ── Üç ölçü ── Tasarımda TEK SIRA üç kutu: ciro · sipariş · ort. ödeme.
            **"Gecikme" burada YOK** (kullanıcı kararı 30.07): dördüncü kutu olarak eklenmişti ve iki
            gerekçeyle düştü. (1) Vade durumu bir alttaki vade/limit kutusunda zaten okunuyor — orada
            hem rozet hem açık bakiye hem kutunun rengi söylüyor; iki yerde söylenen bir uyarı,
            operatörün ikisini de saymasına yol açar. (2) Gecikme sayısı KARNE ölçüsüdür ve karnenin
            yaşadığı iki yer var: mobil karne kutusu ve vade/limit diyaloğu. Limit yazılırken görünmesi
            gereken sayı, panelde bir vitrin sayısı olmak zorunda değil.
            Kutular bir SARMAL KARTIN içinde değil: `Metric`in kendi kenarı ve beyaz zemini var,
            sarılınca kart-içinde-kart oluyordu. */}
        <div className="grid grid-cols-3 gap-2.5">
          <Metric label="Ciro" value={loading || !detail ? '…' : money(detail.revenueCents)} />
          <Metric label="Sipariş" value={loading || !detail ? '…' : String(detail.orderCount)} />
          <Metric
            label="Ort. ödeme"
            value={loading || !detail ? '…' : avgLabel(detail.avgPaymentDays)}
            // Pencere YALNIZ bu hücrede geçerli: ciro/sipariş tüm zamanı okur. Başlığa asılsa üçü de
            // "son 50 sipariş"ten sanılırdı. Gecikme geçmişi varsa ortalama da uyarı rengine döner:
            // "makul" görünen bir ortalamanın içinde bir kez 45 günlük gecikme saklı olabilir — ve
            // gecikme kutusu kaldırıldığı için o bilgiyi taşıyan tek işaret bu renk ve ipucu.
            hint={
              detail
                ? detail.avgPaymentDays === null
                  ? 'Tahsilat hareketi yok — ölçülemiyor (sıfır değil, bilinmiyor)'
                  : `Son ${detail.scorecardWindow} siparişten ${detail.paidOrderCount} ödenmişin ortalaması` +
                    (detail.latePaymentCount > 0
                      ? ` · ${detail.latePaymentCount} kez vadeyi (${detail.termDays} gün) aşarak ödedi`
                      : '')
                : undefined
            }
            tone={detail && detail.latePaymentCount > 0 ? 'red' : undefined}
          />
        </div>

        {/* ── B2B onay ── YALNIZ şirket müşterisinde: bireysel müşteride "onay" diye bir soru yok ve
            boş bir kutu "bir şey eksik mi" düşündürür. Kutu eski `/operations/b2b-approvals` sayfasının
            yerini alıyor (kullanıcı kararı 30.07): onay ayrı bir varlık değil, bu müşterinin bir hâli. */}
        {row.type === 'company' ? (
          <div
            className={`flex flex-wrap items-center gap-2.5 rounded-ops-card border px-3.5 py-3 ${
              row.b2bApproved === false ? 'border-ops-amber-line bg-ops-amber-bg' : 'border-ops-line bg-ops-white'
            }`}
          >
            <span className="mr-auto flex min-w-0 flex-col gap-px">
              <span className="font-ops-display text-ops-xs font-semibold text-ops-ink">B2B onayı</span>
              <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-muted">
                {row.b2bApproved === true
                  ? 'Onaylı — toptan fiyatları görüyor.'
                  : row.b2bApproved === false
                    ? 'Onay bekliyor — toptan fiyat görmüyor, perakende fiyatla alışveriş yapıyor.'
                    : 'Başvuru kaydı yok; şirket olarak işaretli ama onay süreci hiç başlamamış.'}
              </span>
            </span>
            <Badge tone={row.b2bApproved === true ? 'olive' : row.b2bApproved === false ? 'amber' : 'neutral'} outline>
              {row.b2bApproved === true ? 'Onaylı' : row.b2bApproved === false ? 'Bekliyor' : 'Başvuru yok'}
            </Badge>
            <Button variant="secondary" size="sm" onClick={onOpenB2b} disabled={saving}>
              Başvuruyu incele
            </Button>
          </div>
        ) : null}

        {/* ── Vade / limit ── Kutunun RENGİ durumu söyler. */}
        {detail ? (
          <div
            className={`flex flex-col gap-2.5 rounded-ops-card border px-3.5 py-3 ${
              gecikme ? 'border-ops-red-line bg-ops-red-bg' : 'border-ops-olive-line bg-ops-olive-bg'
            }`}
          >
            {/* Başlık BÖLÜM ETİKETİ DEĞİL, kutunun adı: tasarımda cümle düzeninde, koyu ve display
                yazısıyla duruyor. Büyük harfe çevrilip küçültülmüştü ve o kademe "Son siparişler" gibi
                bölüm etiketlerine ait — kutu başlığıyla bölüm etiketi aynı görünürse ikisinin de ağırlığı
                kayboluyor. Durum çipi ÇERÇEVELİ: renkli kutunun içinde dolgulu çip zemininde kayboluyor. */}
            <div className="flex items-center gap-2">
              <span className="mr-auto font-ops-display text-ops-xs font-semibold text-ops-ink">Vade / limit</span>
              <Badge tone={gecikme ? 'red' : detail.creditEnabled ? 'olive' : 'neutral'} outline>
                {gecikme ? 'Gecikmiş' : detail.creditEnabled ? 'Açık' : 'Kapalı'}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <InlineMetric
                label="Limit"
                value={detail.creditLimitCents === null ? 'tanımsız' : money(detail.creditLimitCents)}
                hint={
                  detail.creditLimitCents === null
                    ? 'Limit tanımsız — önceden onaylanmış tutar yok, her vadeli sipariş admin onayına düşer'
                    : undefined
                }
              />
              <InlineMetric label="Açık bakiye" value={money(detail.openBalanceCents)} tone={gecikme ? 'red' : undefined} />
              <InlineMetric
                label="Vade süresi"
                value={`${detail.termDays} gün`}
                hint={
                  detail.customTermDays === null
                    ? 'Genel varsayılan geçerli'
                    : `Bu müşteriye özel süre (genel varsayılan ${detail.defaultTermDays} gün)`
                }
              />
            </div>

            {gecikme ? (
              <p className="font-ops-body text-ops-xs leading-[1.6] text-ops-red">
                ⚠ Gecikmiş vade — checkout&apos;ta vadeli seçenek otomatik kapalı (sistem freni).
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3">
            <span className="font-ops-body text-ops-sm text-ops-muted">Yükleniyor…</span>
          </div>
        )}

        {/* ── Kapıda ödeme + indirim — tasarımda YAN YANA iki kutu ve İKİSİ DE SALT GÖRÜNÜM ──
            Değiştirme yolu `Düzenle` formu: ikisi de müşteriye dair bir NİYET ayarıdır (kimlik
            bilgisiyle aynı raf), türetilmiş bir ölçü değil. Panelde anahtar/kutu dururken tıklama anında
            yazılıyordu — geri alınamayan, onaylanmayan, gövdesinde hiç "Kaydet" olmayan bir yazma. */}
        {detail ? (
          <div className="flex flex-wrap gap-2.5">
            <Readout
              label="Kapıda ödeme"
              hint={
                detail.codAllowed
                  ? 'Varsayılan açık. Ödememe ya da ret geçmişi varsa Düzenle formundan kapatın.'
                  : 'Kapalı — müşteri checkout’ta kapıda ödeme seçeneğini göremiyor.'
              }
              value={<Badge tone={detail.codAllowed ? 'olive' : 'neutral'}>{detail.codAllowed ? 'Açık' : 'Kapalı'}</Badge>}
            />
            <Readout
              label="İndirim"
              // Boş oran ile %0 aynı şey değil: `null` "oranı yok" (liste fiyatı), `0` tanımlı ama sıfır
              // bir oran. Ekran ikisini ayrı yazar — birleştirmek fiyat ekranında "oranı tanımlı
              // müşteriler" listesini okunamaz hâle getirirdi.
              hint={
                detail.discountPercent === null
                  ? 'Genel indirim oranı tanımlı değil — liste fiyatı geçerli.'
                  : 'Her siparişe uygulanan genel oran; Düzenle formundan değiştirilir.'
              }
              value={
                <span className="font-ops-mono text-ops-sm font-medium text-ops-ink">
                  {detail.discountPercent === null ? 'yok' : percent(detail.discountPercent)}
                </span>
              }
            />
          </div>
        ) : null}

        {/* ── Son siparişler ── */}
        <Section title="Son siparişler">
          {loading ? (
            <span className="font-ops-body text-ops-sm text-ops-muted">Yükleniyor…</span>
          ) : detail && detail.lastOrders.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {detail.lastOrders.map((o) => (
                <OrderCard key={o.id} order={o} onOpen={() => onOpenOrder(o.id)} />
              ))}
            </div>
          ) : (
            <span className="font-ops-body text-ops-sm text-ops-faint">Henüz siparişi yok.</span>
          )}
        </Section>

        {/* ── Adresler ── */}
        {detail ? (
          <Section title="Adresler">
            {detail.addresses.length === 0 ? (
              <span className="font-ops-body text-ops-sm text-ops-faint">Kayıtlı adresi yok.</span>
            ) : (
              <div className="flex flex-col gap-1.5">
                {detail.addresses.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-2.5 py-2"
                  >
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="truncate font-ops-body text-ops-sm text-ops-ink">{a.line}</span>
                      <span className="font-ops-mono text-ops-xs text-ops-muted">
                        {a.postalCode} {a.city} · {a.country}
                      </span>
                    </span>
                    <span className="ml-auto flex flex-none items-center gap-1.5">
                      {a.label ? <Badge tone="neutral">{a.label}</Badge> : null}
                      {a.isDefault ? <Badge tone="olive">varsayılan</Badge> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        ) : null}

        {/* ── Puan ve kişisel kuponlar ── */}
        {detail ? (
          <Section
            title="Puan ve kişisel kuponlar"
            aside={
              // Puan yalnız B2C'de anlamlı: şirkette `null` gelir ve "0 puan" YAZILMAZ — sıfır
              // "kazanabilir ama kazanmamış" demektir, oysa kazanamaz (DOMAIN §14).
              detail.pointsBalance === null ? (
                <span className="font-ops-body text-ops-xs text-ops-faint">puan B2C&apos;ye özel</span>
              ) : (
                <span className="font-ops-mono text-ops-xs font-semibold text-ops-olive">
                  {detail.pointsBalance} puan
                </span>
              )
            }
          >
            {detail.personalCoupons.length === 0 ? (
              <span className="font-ops-body text-ops-sm text-ops-faint">Kişisel kuponu yok.</span>
            ) : (
              <div className="flex flex-col gap-1.5">
                {detail.personalCoupons.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-2.5 py-2"
                  >
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="truncate font-ops-body text-ops-sm text-ops-ink">{c.name}</span>
                      <span className="truncate font-ops-mono text-ops-xs text-ops-muted">
                        {c.codes.length > 0 ? c.codes.join(' · ') : 'kodsuz'}
                      </span>
                    </span>
                    <span className="ml-auto flex flex-none items-center gap-1.5">
                      <span className="font-ops-mono text-ops-sm font-medium text-ops-ink">
                        {c.isPercent ? percent(c.value) : money(c.value)}
                      </span>
                      {/* Kotası dolmuş kupon KAPALI görünür: "geçerli" yazan ama uygulanamayan bir
                          kupon, müşteriye tutulmayan bir sözdür. */}
                      {!c.isActive ? (
                        <Badge tone="neutral">kapalı</Badge>
                      ) : c.maxUses !== null && c.usedCount >= c.maxUses ? (
                        <Badge tone="neutral">kota doldu</Badge>
                      ) : (
                        <Badge tone="olive" dot>
                          geçerli
                        </Badge>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        ) : null}

        {/* ── Pazarlama izinleri — SALT GÖRÜNÜM, tasarımda iki ÇİP ── */}
        {detail ? (
          <Section title="Pazarlama izinleri (salt görünüm · GDPR)">
            <div className="flex flex-wrap items-center gap-1.5">
              <ConsentChip channel="E-posta" consent={detail.consent.email} />
              <ConsentChip channel="WhatsApp" consent={detail.consent.whatsapp} />
            </div>
            <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-faint">
              İzin müşterinin kendi eylemiyle doğar; buradan verilemez.
            </span>
          </Section>
        ) : null}

        {/* ── Edinim + talepler ── Tasarım HTML'inde çizilmemiş; `admin-musteriler.md` §2 istiyor.
            İçeriği satır-içi ölçüler (kart olacak satır yok) — bu yüzden bölümün gövdesi kendisi bir
            kutu: kutusuz kalsa üç değer panelin zemininde başıboş dururdu. */}
        {detail ? (
          <Section title="Bağlam">
            <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3">
              <InlineMetric label="Edinim" value={detail.acquisitionSource ?? 'kayıtlı değil'} />
              {detail.referredByName ? <InlineMetric label="Getiren" value={detail.referredByName} /> : null}
              <div className="flex flex-col gap-px">
                <span className="font-ops-body text-ops-micro text-ops-muted">Talepler</span>
                {detail.ticketCount === 0 ? (
                  <span className="font-ops-body text-ops-sm text-ops-faint">yok</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="font-ops-mono text-ops-sm font-medium text-ops-ink">{detail.ticketCount}</span>
                    {detail.openTicketCount > 0 ? <Badge tone="amber">{detail.openTicketCount} açık</Badge> : null}
                    {/* BEKLEYEN(09.12): talepler ekranı yok, köprü oraya açılacak. Sayı gösterilir ama
                        tıklanabilir yapılmaz — 404'e giden bir bağ, olmayan bir bağdan kötüdür. */}
                  </span>
                )}
              </div>
            </div>
          </Section>
        ) : null}
      </div>

      {/* ── Aksiyon şeridi ── Tasarımda dört düğme; ikisi 09.10'a ait. */}
      <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-2 border-t border-ops-line bg-ops-subtle px-5 py-3">
        <Button variant="dark" size="sm" onClick={onEdit} disabled={saving || !detail}>
          Düzenle
        </Button>
        <Button variant="secondary" size="sm" onClick={onEditCredit} disabled={saving || !detail}>
          Vade / limit
        </Button>
        {/* Birleştir ve GDPR sil tasarımda BU ŞERİTTE ama işi 09.10'un: siparişleri/puanları taşıyan
            bir RPC ve geri dönüşsüz onay akışı gerekiyor. Çalışmayan bir düğme "basınca bir şey olur"
            sözü vermek olurdu, o yüzden hiç çizilmiyor. BEKLEYEN(09.10) */}
        {saveError ? (
          <span className="font-ops-body text-ops-xs font-semibold text-ops-red" role="alert">
            {saveError}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Ortalama ödeme etiketi — `null` ÖLÇÜLEMEDİ demek, sıfır değil (CLAUDE.md §1). */
function avgLabel(days: number | null): string {
  if (days === null) return '—';
  return `${days > 0 ? '+' : ''}${days} gün`;
}

/**
 * Bölüm — etiket + içerik, SARMAL KART YOK.
 *
 * Bir tur her bölüm beyaz bir kartın içine alınmıştı ve içindeki satırlar da beyaz kart olduğu için
 * kart-içinde-kart çıkıyordu: iki iç içe çerçeve, ikisi de aynı renkte, hiçbiri bir şey ayırmıyor.
 * Tasarımda etiket panelin zemininde yüzer, KART OLAN yalnız satırların kendisi — böylece "kart" işareti
 * tek anlama gelir: tıklanabilir/ayrı bir kayıt.
 */
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="mr-auto font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
          {title}
        </span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/**
 * Salt görünüm ayar kutusu — tasarımın "etiket solda, değer sağda" tek satırlık kutusu.
 *
 * Gerekçe `title`'da, kutunun içinde değil: açıklama satırı yazıldığında iki kutu farklı yükseklikte
 * duruyordu ve panel bir metin duvarına dönüyordu. Bilgi kaybolmuyor, ekranı işgal etmiyor.
 */
function Readout({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div
      title={hint}
      className="flex min-w-[170px] flex-1 items-center gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-2.5"
    >
      <span className="mr-auto font-ops-body text-ops-xs font-medium text-ops-strong">{label}</span>
      {value}
    </div>
  );
}

/**
 * Bir iznin ÇİPİ. ÜÇ hâl var ve üçü ayrı: verildi, reddedildi, hiç sorulmadı. Son ikisini
 * birleştirmek GDPR kanıtını bozar — "reddetti" bir beyandır, "sorulmadı" bir boşluktur.
 *
 * Tarih ve kaynak `title`'da: kanıt kaybolmaz ama çip tek satırda kalır (tasarımın istediği hâl).
 */
function ConsentChip({ channel, consent }: { channel: string; consent: ConsentView | null }) {
  const durum = consent === null ? 'sorulmadı' : consent.granted ? 'açık' : 'kapalı';
  const kanit = consent?.at ? `${shortDate(consent.at)}${consent.source ? ` · ${consent.source}` : ''}` : 'kayıt yok';
  return (
    <span title={`${channel}: ${durum} — ${kanit}`}>
      <Badge tone={consent?.granted ? 'olive' : 'neutral'} dot={consent?.granted === true}>
        {channel} {durum}
      </Badge>
    </span>
  );
}

/**
 * Sipariş kartı — İKİ NİYET, iki hedef (kullanıcı kararı 30.07):
 *  · **kart gövdesi** → özet diyaloğu ("şuna bir bakayım", ekran kaybolmadan)
 *  · **sipariş kodu** → detay sayfası ("bunun üzerinde çalışacağım")
 *
 * Kod, tıklanabilir kartın İÇİNDE ayrı bir bağ. `stopPropagation` şart: olmasa tıklama yukarı kabarır
 * ve kod hem sayfaya gider hem diyaloğu açardı. Kart `<button>` değil `<div role="button">` çünkü
 * içinde bir bağ var ve HTML bir düğmenin içine bağ koymayı yasaklıyor.
 *
 * Satır TEK sıra (tasarım): kod · tarih · tutar · ödeme rozeti. Sipariş durumu `title`'da — dört
 * bilgiyi iki satıra bölmek listeyi taramayı zorlaştırıyordu.
 */
function OrderCard({ order, onOpen }: { order: CustomerOrderRow; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      title={`${ORDER_STATUS_LABELS[order.status]} — özeti aç (kodun üzerine tıklarsan detay sayfası)`}
      className="flex cursor-pointer items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-2.5 py-2 transition-colors hover:border-ops-line-strong hover:bg-ops-subtle"
    >
      {order.referenceNo ? (
        <Link
          href={order.href}
          onClick={(e) => e.stopPropagation()}
          title="Sipariş detay sayfasını aç"
          className="cursor-pointer truncate font-ops-mono text-ops-sm font-medium text-ops-ink underline decoration-ops-line-strong decoration-1 underline-offset-2 transition-colors hover:text-ops-olive hover:decoration-ops-olive"
        >
          {order.referenceNo}
        </Link>
      ) : (
        // Referansı olmayan sipariş TASLAKTIR: bağ verilmez ama satır kalır — "denedi, tamamlamadı"
        // bilgisi müşteriyi anlamanın parçası.
        <span className="truncate font-ops-mono text-ops-sm font-medium text-ops-muted">taslak</span>
      )}
      <span className="truncate font-ops-body text-ops-xs text-ops-muted">{shortDate(order.createdAt)}</span>
      <span className="ml-auto flex flex-none items-center gap-2">
        <span className="font-ops-mono text-ops-sm font-medium text-ops-ink">{money(order.totalCents)}</span>
        <Badge tone={paymentTone(order.paymentStatus)}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
      </span>
    </div>
  );
}
