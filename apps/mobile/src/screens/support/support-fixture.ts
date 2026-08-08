import type { TicketStatus, TicketType } from '@lezzet/types';

/*
  TALEP TEST/DEMO VERİSİ — 21.14 ikinci dilim, UI-only: müşteri talep uçları YOK ve bu etapta
  backend işi ÜRETİLMEZ. Liste, detay ve yeni talep AYNI satırlardan besleniyor (sipariş
  fixture'ının gerekçesiyle: iki ayrı yer tutucudan biri mutlaka eskir).

  DURUM VE TÜR ŞEMADAN (`TicketStatus` · `TicketType`): ikisi de `@lezzet/types`ta kapalı bir küme
  olarak duruyor, burada uydurulmadı. Talebin müşteriye görünen NUMARASI (`T-108`) sayfaya özel —
  şema tarafında kimlik uuid'dir ve müşteriye gösterilecek kısa numara henüz sözleşmede yok
  (sipariş referansının karşılığı; uç geldiğinde oradan gelir).

  ── ŞABLONDAN SAPMA: İKİNCİ TALEP ───────────────────────────────────────────
  v3 tek talep taşıyor (`T-108`, çözülmüş) ama listeyi İKİ yer tutucuyla çiziyor. Tek satırlı bir
  demo listede durum rozetinin ayırt ediciliği hiç görünmezdi — ikinci satır (açık, siparişsiz
  soru) o yüzden var. Veri farkıdır, tasarım farkı değil.
*/

/** Yazışmanın tek mesajı. */
export interface TicketMessageView {
  id: string;
  /** Müşterinin kendi mesajı mı — hizayı ve baloncuk rengini bu belirler. */
  fromCustomer: boolean;
  body: string;
}

export interface TicketView {
  /** Müşteriye görünen talep numarası (`T-108`) — rotanın da parametresi budur. */
  id: string;
  type: TicketType;
  status: TicketStatus;
  /** Bağlı sipariş referansı; genel talepte `null`. */
  orderReference: string | null;
  /** Açılış tarihi — biçimlenmiş metin (uç geldiğinde ISO gelir, biçimleme cihazda olur). */
  createdAtLabel: string;
  /** Kapanışın sonucu ("11,40 € iade edildi"); yalnız çözülmüş talepte dolu. */
  resolutionLabel: string | null;
  messages: TicketMessageView[];
}

/** Şablonun talebi + listenin ikinci satırı. */
export function ticketsFixture(): TicketView[] {
  return [
    {
      id: 'T-108',
      type: 'missing',
      status: 'resolved',
      orderReference: 'LA-2411',
      createdAtLabel: '30 Temmuz 2026',
      resolutionLabel: '11,40 € iade edildi',
      messages: [
        { id: 'm1', fromCustomer: true, body: 'Cevizli sarma pakette çıkmadı, kontrol edebilir misiniz?' },
        {
          id: 'm2',
          fromCustomer: false,
          body: 'Merhaba! Depo kaydını kontrol ettik, haklısınız — tutarı aynı karta iade ettik. Özür dileriz.',
        },
        { id: 'm3', fromCustomer: true, body: 'Hızlı dönüş için teşekkürler.' },
      ],
    },
    {
      id: 'T-109',
      type: 'question',
      status: 'open',
      orderReference: null,
      createdAtLabel: '6 Ağustos 2026',
      resolutionLabel: null,
      messages: [
        { id: 'm1', fromCustomer: true, body: 'Donuk ürünleri kaç gün buzlukta saklayabilirim?' },
      ],
    },
  ];
}

/** Numarayla tek talep; bulunamazsa `null` — "yok" ile "boş" aynı şey değildir (CLAUDE §1). */
export function ticketById(id: string): TicketView | null {
  return ticketsFixture().find((ticket) => ticket.id === id) ?? null;
}
