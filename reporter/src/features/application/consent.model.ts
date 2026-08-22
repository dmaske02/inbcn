export const CONSENT_NOTICE_KEYS = [
  "payment_refund",
  "kyc",
  "public_identity",
  "mandatory_location",
  "recording",
  "editorial_terms",
] as const;

export type ConsentNoticeKey = (typeof CONSENT_NOTICE_KEYS)[number];
export type ConsentLocale = "en" | "hi" | "mr";

const versions = {
  payment_refund: "1.0",
  kyc: "1.0",
  public_identity: "1.0",
  mandatory_location: "1.0",
  recording: "1.0",
  editorial_terms: "1.0",
} as const satisfies Record<ConsentNoticeKey, string>;

const copy = {
  en: {
    payment_refund: "I accept the INR 100 application fee, payment, renewal, rejection, and incomplete-application refund terms.",
    kyc: "I consent to hosted identity and adult-status verification for this reporter application, subject to the approved alternative process.",
    public_identity: "I understand that my verified legal name and separately supplied, approved portrait will be shown publicly with my journalism.",
    mandatory_location: "I consent to providing precise location with each submission for private editorial and verification use.",
    recording: "I consent to recording approved live broadcasts and to the stated editorial publication and retention process.",
    editorial_terms: "I accept the editorial rules, review, suspension, historical attribution, and correction requirements for reporters.",
  },
  hi: {
    payment_refund: "मैं ₹100 आवेदन शुल्क, भुगतान, नवीनीकरण, अस्वीकृति और अधूरे आवेदन की धनवापसी की शर्तें स्वीकार करता/करती हूँ।",
    kyc: "मैं इस रिपोर्टर आवेदन के लिए स्वीकृत वैकल्पिक प्रक्रिया सहित होस्टेड पहचान और वयस्कता सत्यापन की सहमति देता/देती हूँ।",
    public_identity: "मैं समझता/समझती हूँ कि मेरा सत्यापित कानूनी नाम और अलग से दी गई स्वीकृत तस्वीर मेरी पत्रकारिता के साथ सार्वजनिक होगी।",
    mandatory_location: "मैं निजी संपादकीय और सत्यापन उपयोग के लिए हर प्रस्तुति के साथ सटीक स्थान देने की सहमति देता/देती हूँ।",
    recording: "मैं स्वीकृत लाइव प्रसारण की रिकॉर्डिंग और बताई गई संपादकीय प्रकाशन व संरक्षण प्रक्रिया की सहमति देता/देती हूँ।",
    editorial_terms: "मैं रिपोर्टरों के लिए संपादकीय नियम, समीक्षा, निलंबन, ऐतिहासिक श्रेय और सुधार की आवश्यकताएँ स्वीकार करता/करती हूँ।",
  },
  mr: {
    payment_refund: "मी ₹100 अर्ज शुल्क, देयक, नूतनीकरण, नकार आणि अपूर्ण अर्जाच्या परताव्याच्या अटी मान्य करतो/करते.",
    kyc: "मी या वार्ताहर अर्जासाठी मंजूर पर्यायी प्रक्रियेसह होस्टेड ओळख आणि प्रौढत्व पडताळणीस संमती देतो/देते.",
    public_identity: "माझे पडताळलेले कायदेशीर नाव आणि स्वतंत्रपणे दिलेले मंजूर छायाचित्र माझ्या पत्रकारितेसोबत सार्वजनिक होईल हे मला मान्य आहे.",
    mandatory_location: "मी खासगी संपादकीय आणि पडताळणी वापरासाठी प्रत्येक सादरीकरणासोबत अचूक स्थान देण्यास संमती देतो/देते.",
    recording: "मी मंजूर थेट प्रसारणाच्या ध्वनिचित्रमुद्रणास आणि नमूद संपादकीय प्रकाशन व जतन प्रक्रियेस संमती देतो/देते.",
    editorial_terms: "मी वार्ताहरांसाठी संपादकीय नियम, पुनरावलोकन, निलंबन, ऐतिहासिक श्रेय आणि दुरुस्तीच्या अटी मान्य करतो/करते.",
  },
} as const satisfies Record<ConsentLocale, Record<ConsentNoticeKey, string>>;

export type ConsentNotice = Readonly<{
  key: ConsentNoticeKey;
  version: string;
  text: string;
  accepted: false;
}>;

export type ConsentReceipt = Readonly<{
  key: ConsentNoticeKey;
  version: string;
  locale: ConsentLocale;
  consentedAt: string;
  withdrawnAt?: string | null;
}>;

export function getConsentNotices(locale: ConsentLocale): readonly ConsentNotice[] {
  return CONSENT_NOTICE_KEYS.map((key) => ({
    key,
    version: versions[key],
    text: copy[locale][key],
    accepted: false,
  }));
}

export function createConsentReceipts(
  input: Readonly<{ locale: ConsentLocale; acceptedKeys: readonly ConsentNoticeKey[] }>,
  consentedAt: string,
): readonly ConsentReceipt[] {
  if (!(input.locale in copy) || Number.isNaN(Date.parse(consentedAt))) {
    throw new TypeError("Invalid consent receipt.");
  }
  const accepted = new Set(input.acceptedKeys);
  if (!CONSENT_NOTICE_KEYS.every((key) => accepted.has(key))) {
    throw new TypeError("Accept every consent notice separately before payment.");
  }
  return CONSENT_NOTICE_KEYS.map((key) => ({
    key,
    version: versions[key],
    locale: input.locale,
    consentedAt,
  }));
}

export function hasCurrentConsentReceipts(receipts: readonly ConsentReceipt[]): boolean {
  return CONSENT_NOTICE_KEYS.every((key) => receipts.some((receipt) =>
    receipt.key === key
    && receipt.version === versions[key]
    && receipt.withdrawnAt == null
    && receipt.locale in copy));
}

export function missingConsentReceipts(
  requested: readonly ConsentReceipt[],
  persisted: readonly ConsentReceipt[],
): readonly ConsentReceipt[] {
  return requested.filter((receipt) => !persisted.some((existing) =>
    existing.key === receipt.key && existing.version === receipt.version));
}
