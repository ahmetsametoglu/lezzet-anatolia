// @lezzet/email — mail istemcisi + şablonlar. Auth OTP dahil TÜM mail buradan.
// Supabase mail yapısı KULLANILMAZ. İçerik: docs/build/14-bildirim-email.md
export { sendEmail, type SendEmailParams, type SendEmailResult } from './client';
export { OtpCodeEmail, otpSubject, type OtpCodeEmailProps } from './templates/otp-code';

// Sipariş bildirimleri (14.5) — üç şablon ortak iskeleti paylaşır.
export { OrderConfirmedEmail, orderConfirmedSubject, type OrderEmailProps } from './templates/order-confirmed';
export { OrderOutForDeliveryEmail, orderOutForDeliverySubject } from './templates/order-out-for-delivery';
export { OrderDeliveredEmail, orderDeliveredSubject } from './templates/order-delivered';

// İstisna bildirimleri — zaman çizgisi yerine tek durum bloğu, para çözümü ilk kartta.
export { OrderCancelledEmail, orderCancelledSubject } from './templates/order-cancelled';
export { OrderShortfallEmail, orderShortfallSubject } from './templates/order-shortfall';
export { OrderRefundedEmail, orderRefundedSubject } from './templates/order-refunded';

// Talep bildirimleri (14.7 · 16.4) — aynı iskelet; her mail yazışmanın kendisini taşır.
export {
  TicketReceivedEmail,
  TicketRepliedEmail,
  TicketStatusChangedEmail,
  ticketReceivedSubject,
  ticketRepliedSubject,
  ticketStatusChangedSubject,
  type TicketEmailProps,
} from './templates/ticket-notification';

// Alım-sonrası değerlendirme daveti (17.2) — aynı iskelet, tek eylem.
export { FeedbackInviteEmail, feedbackInviteSubject, type FeedbackInviteEmailProps } from './templates/feedback-invite';
