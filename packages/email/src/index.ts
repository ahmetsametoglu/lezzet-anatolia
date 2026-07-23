// @lezzet/email — mail istemcisi + şablonlar. Auth OTP dahil TÜM mail buradan.
// Supabase mail yapısı KULLANILMAZ. İçerik: docs/build/14-bildirim-email.md
export { sendEmail, type SendEmailParams, type SendEmailResult } from './client';
export { OtpCodeEmail, otpSubject, type OtpCodeEmailProps } from './templates/otp-code';
