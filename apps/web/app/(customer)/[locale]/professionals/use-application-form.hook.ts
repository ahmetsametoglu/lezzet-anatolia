'use client';

import { useRef, useState, useTransition } from 'react';
import {
  b2bApplicationIssues,
  vatNumberProblem,
  type B2bApplicationField,
  type B2bApplicationInput,
  type B2bApplicationKind,
  type B2bCompanyFacts,
} from '@lezzet/domain-core';
import type { AuthErrorKey } from '@/lib/auth/errors';
import { sendEmailOtp } from '@/lib/auth/otp-actions';
import { applyAsCustomerAction, checkVatAction, lookupSiretAction, verifyAndApplyAction } from './actions';
import type { ApplicationDefaults } from './professionals-types';

/** Sunucu eylemine hiç ulaşılamadığında (ağ yok) dönen anahtar; cümlesini yüzey kurar. */
export const NETWORK_ERROR = 'network';

/** Resmî kayıttan gelen alanlar: okununca eski hataları birlikte silinir. */
const COMPANY_FIELDS: readonly B2bApplicationField[] = ['siret', 'legalName', 'line1', 'postalCode', 'city'];

const NO_FACTS: B2bCompanyFacts = { activityCode: null, foundedYear: null, isActive: null, vatNumber: null };

function emptyInput(defaults: ApplicationDefaults): B2bApplicationInput {
  return {
    kind: 'siret',
    siret: '',
    legalName: '',
    vatNumber: '',
    contactName: defaults.contactName,
    email: defaults.email,
    phone: defaults.phone,
    line1: '',
    postalCode: '',
    city: '',
  };
}

/**
 * Başvurunun iki yüzeyde ortak işi: alanlar, resmî kayıt, vergi numarası, denetim ve gönderim. Sonuçlar hata anahtarı olarak döner,
 * çünkü cümleleri ve yerleşimi her yüzey kendi sözlüğünden kurar.
 */
export function useApplicationForm(defaults: ApplicationDefaults) {
  const [input, setInput] = useState<B2bApplicationInput>(() => emptyInput(defaults));
  const [facts, setFacts] = useState<B2bCompanyFacts>(NO_FACTS);
  const [issues, setIssues] = useState<B2bApplicationField[]>([]);
  /** AB numarasının doğrulaması: `true`/`false`, `null` sorulamadı, `undefined` sorulmadı — dördü ayrı cümle. */
  const [vatValid, setVatValid] = useState<boolean | null | undefined>(undefined);
  const [pending, startSubmit] = useTransition();
  const [lookingUp, startLookup] = useTransition();
  const [checkingVat, startVat] = useTransition();
  /** Numaranın sürümü: cevap gelene kadar numara değiştiyse eski numaranın sonucu yeni numaraya yazılmaz. */
  const vatRun = useRef(0);

  const set = (patch: Partial<B2bApplicationInput>) => {
    // Numara değişince eski işaret düşer: doğrulanmamış bir numarayı doğrulanmış göstermek olurdu.
    if (patch.vatNumber !== undefined) {
      vatRun.current += 1;
      setVatValid(undefined);
    }
    setInput((prev) => ({ ...prev, ...patch }));
  };
  const invalid = (field: B2bApplicationField): boolean => issues.includes(field);

  /** Sekme değişince kimlik alanları sıfırlanır, çünkü iki yolun künyesi birbirinin yerine geçmez; aynı sekmede `false` döner. */
  function switchKind(kind: B2bApplicationKind): boolean {
    if (kind === input.kind) return false;
    vatRun.current += 1;
    setFacts(NO_FACTS);
    setVatValid(undefined);
    setIssues([]);
    setInput((prev) => ({ ...prev, kind, siret: '', vatNumber: '', legalName: '', line1: '', postalCode: '', city: '' }));
    return true;
  }

  /** Resmî kaydı okuyup alanları doldurur; bulunamazsa hata anahtarını döner. */
  function lookup(): Promise<string | null> {
    return new Promise((resolve) => {
      startLookup(async () => {
        const res = await lookupSiretAction(input.siret).catch(() => ({ data: null, errorKey: NETWORK_ERROR }));
        if (!res.data) {
          setFacts(NO_FACTS);
          resolve(res.errorKey ?? 'unexpected');
          return;
        }
        const record = res.data;
        // KDV numarası künyenin parçası: taşınmazsa Fransız başvurusunda onay kartının KDV satırı boş kalır.
        setFacts({ activityCode: record.activityCode, foundedYear: record.foundedYear, isActive: record.isActive, vatNumber: record.vatNumber });
        set({ siret: record.siret, legalName: record.legalName, line1: record.line1, postalCode: record.postalCode, city: record.city });
        setIssues((prev) => prev.filter((field) => !COMPANY_FIELDS.includes(field)));
        resolve(null);
      });
    });
  }

  /** Vergi numarasını doğrulatır; kabul edilmeyen ülkenin numarası sorulmaz, "Doğrulandı" başvurunun geçeceğini sandırırdı. */
  function checkVat(value: string) {
    const problem = value.trim() ? vatNumberProblem(value) : null;
    if (!value.trim() || problem === 'use_siret' || problem === 'unsupported_country') {
      setVatValid(undefined);
      return;
    }
    const run = vatRun.current;
    startVat(async () => {
      const res = await checkVatAction(value).catch(() => null);
      if (run !== vatRun.current) return;
      setVatValid(res?.data ? res.data.valid : null);
    });
  }

  /** Eksik alanları işaretler ve döner; `skip` yüzeyin kendi adımında sorduğu alanlar (telefonda e-posta kimlik adımında). */
  function validate(skip: readonly B2bApplicationField[] = []): B2bApplicationField[] {
    const found = b2bApplicationIssues(input).filter((field) => !skip.includes(field));
    setIssues(found);
    return found;
  }

  /** Girişli müşterinin başvurusu tek adım; doğrulanamayan numara engellemez, çünkü VIES'te görünmeyen meşru şirket vardır. */
  function apply(): Promise<string | null> {
    return new Promise((resolve) => {
      startSubmit(async () => {
        const res = await applyAsCustomerAction(input, facts).catch(() => ({ data: null, errorKey: NETWORK_ERROR }));
        resolve(res.data ? null : (res.errorKey ?? 'unexpected'));
      });
    });
  }

  /** Girişsiz müşteriye tek kullanımlık kodu gönderir; başvuru kod doğrulanınca aynı gövdeyle gider. */
  function sendCode(email: string): Promise<AuthErrorKey | null> {
    return new Promise((resolve) => {
      startSubmit(async () => {
        // Ağ düşerse gönderilemedi sayılır; yakalanmasa geçişin içindeki ret sayfanın hata sınırına giderdi.
        const sent = await sendEmailOtp(email).catch(() => ({ data: null, errorKey: 'send_failed' as const }));
        resolve(sent.errorKey ?? null);
      });
    });
  }

  /** Kodu doğrular ve başvuruyu gönderir; e-posta kimlik adımında yazıldığı için gövdeye burada girer. */
  async function verifyAndApply(email: string, code: string): Promise<string | null> {
    const res = await verifyAndApplyAction(email, code, { ...input, email }, facts).catch(() => ({ data: null, errorKey: NETWORK_ERROR }));
    return res.data ? null : (res.errorKey ?? 'unexpected');
  }

  return { input, set, facts, issues, invalid, vatValid, pending, lookingUp, checkingVat, switchKind, lookup, checkVat, validate, apply, sendCode, verifyAndApply };
}
