import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAppContext } from '../context/AppContext';
import { useT } from '../i18n/useT';
import { dayWord } from '../i18n/pluralDays';
import { FEATURED_GOLD } from '../theme/colors';
import { friendlyErrorMessage } from '../utils/friendlyError';
import { toEnglishDigits } from '../utils/digits';
import StatusScreen from './StatusScreen';
import EdfaliLogo from '../../assets/edfali.svg';
import MoamalatLogo from '../../assets/moamalat.svg';
import SadadLogo from '../../assets/sadad.svg';
import MasrefyPayLogo from '../../assets/masrefypay.svg';

const DURATIONS = [3, 7, 14];
// Display only — create-boost-payment looks up the real price server-side
// and never trusts a client-supplied amount; keep these two in sync by hand.
const FEATURED_PRICES = { 3: 5, 7: 10, 14: 15 };
const GATEWAYS = ['edfali', 'moamalat', 'sadad', 'masrefypay'];
const GATEWAY_LOGOS = {
  edfali: EdfaliLogo,
  moamalat: MoamalatLogo,
  sadad: SadadLogo,
  masrefypay: MasrefyPayLogo,
};
// Moamalat has no fields to collect (redirects to its own hosted page) and
// no OTP step on our side — everyone else collects details, then reviews,
// then verifies an OTP.
const STEPS_DEFAULT = ['duration', 'gateway', 'details', 'review', 'otp'];
const STEPS_MOAMALAT = ['duration', 'gateway', 'review'];

// Masks all but the last few digits, e.g. "0912345678" -> "091****678" —
// this is what makes the review step read as a real payment confirmation
// (you're paying with THIS account) rather than a form you just filled in.
function maskDigits(value, keepStart, keepEnd) {
  if (value.length <= keepStart + keepEnd) return value;
  const middle = '*'.repeat(value.length - keepStart - keepEnd);
  return `${value.slice(0, keepStart)}${middle}${value.slice(-keepEnd)}`;
}

// Shown under each of the seller's own approved listings in MyListingsScreen
// — instant self-serve payment via Dpay, no admin/commission involved. EDFali
// and Sadad confirm via an OTP the seller enters right here; Moamalat has no
// OTP step at all — it opens a hosted payment page and confirmation arrives
// later via the dpay-webhook Edge Function (server-side, HMAC-verified).
// Styled boldly/gold on purpose — this needs to read as a real, worthwhile
// upgrade, not a plain settings row. The whole flow (progress dots, a
// receipt-style review step before anything is charged, a security line on
// every screen, a verification-style OTP screen) is deliberately built to
// feel like a real checkout, not a bare "type some numbers" form.
export default function BoostListingSection({ listing, colors }) {
  const { createBoostPayment, verifyBoostPayment, language } = useAppContext();
  const t = useT();
  const [modalVisible, setModalVisible] = useState(false);
  const [step, setStep] = useState('duration');
  const [duration, setDuration] = useState(null);
  const [gateway, setGateway] = useState(null);
  const [mobile, setMobile] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [session, setSession] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // 'processing'/'success'/'error' are terminal-ish visual states that
  // replace the whole card (no progress dots) rather than steps within the
  // form flow — see the render branch below. outcome holds the title/
  // subtitle for whichever of success/error is showing; errorReturnStep is
  // which real step "Try Again" drops back into (review after a failed
  // session open, otp after a failed code — no reason to make them re-enter
  // their mobile number just because the code was wrong).
  const [outcome, setOutcome] = useState(null);
  const [errorReturnStep, setErrorReturnStep] = useState('review');

  // Featuring is allowed while a listing is still pending admin review, not
  // just once approved — sellers should be able to pay for Featured right at
  // submission time. A rejected listing never becomes publicly visible
  // regardless of is_featured, so there's nothing to offer once rejected.
  // Same for a listing already marked sold/rented — it's excluded from
  // buyer-facing browsing regardless of is_featured, so paying to feature it
  // would just be money spent on a listing nobody can see.
  if (listing.status === 'rejected' || listing.listingState === 'sold') {
    return null;
  }

  const steps = gateway === 'moamalat' ? STEPS_MOAMALAT : STEPS_DEFAULT;
  const stepIndex = Math.max(0, steps.indexOf(step));

  const resetAndClose = () => {
    setModalVisible(false);
    setStep('duration');
    setDuration(null);
    setGateway(null);
    setMobile('');
    setBirthYear('');
    setCardNumber('');
    setOtp('');
    setSession(null);
    setSubmitting(false);
    setOutcome(null);
    setErrorReturnStep('review');
  };

  const handleOpenSession = async () => {
    setSubmitting(true);
    setStep('processing');
    try {
      const params = { listing_id: listing.id, duration_days: duration, pay_method: gateway };
      if (gateway === 'edfali' || gateway === 'sadad') params.customer_mobile = mobile.trim();
      if (gateway === 'sadad') params.birth_year = birthYear.trim();
      if (gateway === 'masrefypay') params.card_number = cardNumber.trim();

      const data = await createBoostPayment(params);
      if (data.payment_link) {
        // Moamalat: no OTP call on our side — the customer finishes payment
        // entirely inside the hosted page, and dpay-webhook confirms it
        // afterwards once Dpay sends payment.paid.
        setSession(data);
        await WebBrowser.openAuthSessionAsync(data.payment_link);
        setOutcome({ title: t('featuredPaymentPendingTitle'), subtitle: t('featuredPaymentPendingMessage') });
        setStep('success');
      } else {
        setSession(data);
        setStep('otp');
      }
    } catch (error) {
      console.warn('createBoostPayment failed', error);
      setOutcome({ title: t('submitErrorTitle'), subtitle: friendlyErrorMessage(error, t) });
      setErrorReturnStep('review');
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async () => {
    setSubmitting(true);
    setStep('processing');
    try {
      await verifyBoostPayment(session.session_id, otp.trim());
      setOutcome({ title: t('featuredPaymentSuccessTitle'), subtitle: t('featuredPaymentSuccessMessage') });
      setStep('success');
    } catch (error) {
      console.warn('verifyBoostPayment failed', error);
      setOtp('');
      setOutcome({ title: t('submitErrorTitle'), subtitle: friendlyErrorMessage(error, t) });
      setErrorReturnStep('otp');
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  // Whole days between now and featured_until, rounded up so "expires in a
  // few hours" still reads as 1 day left, not 0 — same rounding as the
  // listing-expiry countdown in MyListingsScreen.
  const featuredDaysLeft = listing.featuredUntil
    ? Math.ceil((new Date(listing.featuredUntil).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null;

  const detailsValid =
    gateway === 'masrefypay'
      ? cardNumber.trim().length === 7 || cardNumber.trim().length === 9
      : gateway === 'sadad'
        ? mobile.trim().length > 0 && birthYear.trim().length === 4
        : mobile.trim().length > 0;

  const maskedAccount =
    gateway === 'masrefypay' ? maskDigits(cardNumber.trim(), 0, 4) : maskDigits(mobile.trim(), 3, 2);

  return (
    <>
      {listing.isFeatured ? (
        <View
          style={[styles.statusBadgeRow]}
        >
          <View
            style={[
              styles.statusBadge,
              { borderColor: FEATURED_GOLD, backgroundColor: `${FEATURED_GOLD}22` },
            ]}
          >
            <Ionicons name="star" size={14} color={FEATURED_GOLD} />
            <Text style={[styles.statusBadgeText, { color: FEATURED_GOLD }]}>
              {featuredDaysLeft !== null && featuredDaysLeft > 0
                ? t('featuredDaysLeftLabel')
                    .replace('{days}', String(featuredDaysLeft))
                    .replace('{daysWord}', dayWord(featuredDaysLeft, language))
                : t('featuredLabel')}
            </Text>
          </View>
          <Pressable
            style={[styles.renewChip, { borderColor: FEATURED_GOLD }]}
            onPress={() => setModalVisible(true)}
          >
            <Text style={[styles.renewChipText, { color: FEATURED_GOLD }]}>
              {t('renewListingButton')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.requestButton, { backgroundColor: FEATURED_GOLD }]}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="star" size={16} color="#fff" />
          <Text style={styles.requestButtonText}>{t('requestFeaturedButton')}</Text>
        </Pressable>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={submitting ? undefined : resetAndClose}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.backdrop }]}
          onPress={submitting ? undefined : resetAndClose}
        >
          <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
            {step === 'processing' || step === 'success' || step === 'error' ? (
              <StatusScreen
                inline
                variant={step === 'processing' ? 'loading' : step}
                title={
                  step === 'processing'
                    ? session
                      ? t('featuredVerifyingTitle')
                      : t('featuredProcessingTitle')
                    : outcome?.title
                }
                subtitle={step === 'processing' ? t('featuredProcessingSubtitle') : outcome?.subtitle}
                primaryAction={
                  step === 'success'
                    ? { label: t('ok'), onPress: resetAndClose }
                    : step === 'error'
                      ? { label: t('tryAgainButton'), onPress: () => setStep(errorReturnStep) }
                      : undefined
                }
              />
            ) : (
              <>
                <Text style={[styles.title, { color: colors.text }]}>{t('featuredModalTitle')}</Text>

                <View style={styles.progressRow}>
                  {steps.map((s, i) => (
                    <View
                      key={s}
                      style={[
                        styles.progressDot,
                        { backgroundColor: i <= stepIndex ? colors.accent : colors.border },
                        i === stepIndex && styles.progressDotActive,
                      ]}
                    />
                  ))}
                </View>

                <View style={styles.trustRow}>
                  <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
                  <Text style={[styles.trustText, { color: colors.textMuted }]}>
                    {t('securedByDpay')}
                  </Text>
                </View>

                <ScrollView keyboardShouldPersistTaps="handled">
              {step === 'duration' && (
                <>
                  <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
                    {t('featuredDurationLabel')}
                  </Text>
                  <View style={styles.optionRow}>
                    {DURATIONS.map((days) => (
                      <Pressable
                        key={days}
                        onPress={() => setDuration(days)}
                        style={[
                          styles.optionChip,
                          { borderColor: colors.accent },
                          duration === days && { backgroundColor: colors.accent },
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionChipText,
                            { color: duration === days ? colors.accentText : colors.accent },
                          ]}
                        >
                          {t('featuredDurationDays')
                            .replace('{days}', String(days))
                            .replace('{daysWord}', dayWord(days, language))
                            .replace('{price}', String(FEATURED_PRICES[days]))}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    style={[
                      styles.nextButton,
                      { backgroundColor: colors.accent },
                      !duration && styles.disabledButton,
                    ]}
                    disabled={!duration}
                    onPress={() => setStep('gateway')}
                  >
                    <Text style={[styles.nextButtonText, { color: colors.accentText }]}>
                      {t('nextButton')}
                    </Text>
                  </Pressable>
                </>
              )}

              {step === 'gateway' && (
                <>
                  <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
                    {t('featuredGatewayLabel')}
                  </Text>
                  <View style={styles.gatewayList}>
                    {GATEWAYS.map((method) => {
                      const Logo = GATEWAY_LOGOS[method];
                      const active = gateway === method;
                      return (
                        <Pressable
                          key={method}
                          onPress={() => setGateway(method)}
                          style={[
                            styles.gatewayRow,
                            { borderColor: active ? colors.accent : colors.inputBorder },
                            active && { backgroundColor: `${colors.accent}15` },
                          ]}
                        >
                          <View style={styles.gatewayLogoBox}>
                            <Logo width={36} height={36} />
                          </View>
                          <Text style={[styles.gatewayRowText, { color: colors.text }]}>
                            {t(`payMethod_${method}`)}
                          </Text>
                          {active && (
                            <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    style={[
                      styles.nextButton,
                      { backgroundColor: colors.accent },
                      !gateway && styles.disabledButton,
                    ]}
                    disabled={!gateway}
                    onPress={() => setStep(gateway === 'moamalat' ? 'review' : 'details')}
                  >
                    <Text style={[styles.nextButtonText, { color: colors.accentText }]}>
                      {t('nextButton')}
                    </Text>
                  </Pressable>
                </>
              )}

              {step === 'details' && (
                <>
                  {gateway === 'masrefypay' ? (
                    <>
                      <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
                        {t('featuredCardNumberLabel')}
                      </Text>
                      <TextInput
                        style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder="1234567"
                        placeholderTextColor={colors.placeholderText}
                        keyboardType="number-pad"
                        maxLength={9}
                        value={cardNumber}
                        onChangeText={(text) => setCardNumber(toEnglishDigits(text))}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
                        {t('featuredMobileLabel')}
                      </Text>
                      <TextInput
                        style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder="0912345678"
                        placeholderTextColor={colors.placeholderText}
                        keyboardType="phone-pad"
                        value={mobile}
                        onChangeText={(text) => setMobile(toEnglishDigits(text))}
                      />
                      {gateway === 'sadad' && (
                        <>
                          <Text style={[styles.stepLabel, { color: colors.textMuted }]}>
                            {t('featuredBirthYearLabel')}
                          </Text>
                          <TextInput
                            style={[styles.input, { borderColor: colors.inputBorder, color: colors.text }]}
                            placeholder="1994"
                            placeholderTextColor={colors.placeholderText}
                            keyboardType="number-pad"
                            maxLength={4}
                            value={birthYear}
                            onChangeText={(text) => setBirthYear(toEnglishDigits(text))}
                          />
                        </>
                      )}
                    </>
                  )}
                  <Pressable
                    style={[
                      styles.nextButton,
                      { backgroundColor: colors.accent },
                      !detailsValid && styles.disabledButton,
                    ]}
                    disabled={!detailsValid}
                    onPress={() => setStep('review')}
                  >
                    <Text style={[styles.nextButtonText, { color: colors.accentText }]}>
                      {t('nextButton')}
                    </Text>
                  </Pressable>
                </>
              )}

              {step === 'review' && (
                <>
                  <View style={[styles.receipt, { borderColor: colors.inputBorder }]}>
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                        {t('featuredReviewListing')}
                      </Text>
                      <Text
                        style={[styles.receiptValue, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {listing.title}
                      </Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                        {t('featuredReviewDuration')}
                      </Text>
                      <Text style={[styles.receiptValue, { color: colors.text }]}>
                        {t('featuredDurationDays')
                          .replace('{days}', String(duration))
                          .replace('{daysWord}', dayWord(duration, language))
                          .replace('{price}', String(FEATURED_PRICES[duration]))}
                      </Text>
                    </View>
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                        {t('featuredReviewMethod')}
                      </Text>
                      <View style={styles.receiptMethodValue}>
                        {(() => {
                          const Logo = GATEWAY_LOGOS[gateway];
                          return <Logo width={20} height={20} />;
                        })()}
                        <Text style={[styles.receiptValue, { color: colors.text }]}>
                          {t(`payMethod_${gateway}`)}
                        </Text>
                      </View>
                    </View>
                    {gateway !== 'moamalat' && (
                      <View style={styles.receiptRow}>
                        <Text style={[styles.receiptLabel, { color: colors.textMuted }]}>
                          {t('featuredReviewAccount')}
                        </Text>
                        <Text style={[styles.receiptValue, { color: colors.text }]}>
                          {maskedAccount}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.receiptDivider, { backgroundColor: colors.inputBorder }]} />
                    <View style={styles.receiptRow}>
                      <Text style={[styles.receiptTotalLabel, { color: colors.text }]}>
                        {t('featuredReviewTotal')}
                      </Text>
                      <Text style={[styles.receiptTotalValue, { color: FEATURED_GOLD }]}>
                        {FEATURED_PRICES[duration]} {t('priceCurrency')}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    style={[styles.payButton, { backgroundColor: FEATURED_GOLD }]}
                    onPress={handleOpenSession}
                  >
                    <Ionicons name="lock-closed" size={15} color="#fff" />
                    <Text style={styles.payButtonText}>
                      {t('featuredPaySecurelyButton').replace(
                        '{amount}',
                        `${FEATURED_PRICES[duration]} ${t('priceCurrency')}`
                      )}
                    </Text>
                  </Pressable>
                  <View style={styles.trustRow}>
                    <Ionicons name="shield-checkmark" size={12} color={colors.textMuted} />
                    <Text style={[styles.trustText, { color: colors.textMuted }]}>
                      {t('featuredReviewDisclaimer')}
                    </Text>
                  </View>
                </>
              )}

              {step === 'otp' && (
                <>
                  <View style={styles.otpIconWrap}>
                    <View style={[styles.otpIconCircle, { backgroundColor: `${colors.accent}18` }]}>
                      <Ionicons name="shield-checkmark" size={28} color={colors.accent} />
                    </View>
                  </View>
                  <Text style={[styles.otpTitle, { color: colors.text }]}>
                    {t('featuredOtpTitle')}
                  </Text>
                  <Text style={[styles.otpHint, { color: colors.textMuted }]}>
                    {t('featuredOtpSentTo').replace('{account}', maskedAccount)}
                  </Text>
                  <TextInput
                    style={[styles.otpInput, { borderColor: colors.inputBorder, color: colors.text }]}
                    placeholder="••••"
                    placeholderTextColor={colors.placeholderText}
                    keyboardType="number-pad"
                    textAlign="center"
                    value={otp}
                    onChangeText={(text) => setOtp(toEnglishDigits(text))}
                  />
                  <Pressable
                    style={[
                      styles.payButton,
                      { backgroundColor: FEATURED_GOLD },
                      !otp.trim() && styles.disabledButton,
                    ]}
                    disabled={!otp.trim()}
                    onPress={handleVerify}
                  >
                    <Ionicons name="lock-closed" size={15} color="#fff" />
                    <Text style={styles.payButtonText}>{t('featuredVerifyButton')}</Text>
                  </Pressable>
                </>
              )}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  renewChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  renewChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  requestButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  progressDotActive: {
    opacity: 1,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 14,
  },
  trustText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  optionChipText: {
    fontWeight: '600',
    fontSize: 13,
  },
  gatewayList: {
    gap: 10,
    marginBottom: 16,
  },
  gatewayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  gatewayLogoBox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  nextButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nextButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.5,
  },
  receipt: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  receiptLabel: {
    fontSize: 12,
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  receiptMethodValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  receiptDivider: {
    height: 1,
    marginVertical: 2,
  },
  receiptTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  receiptTotalValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 10,
    shadowColor: FEATURED_GOLD,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  payButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  otpIconWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  otpIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  otpHint: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  otpInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 10,
    marginBottom: 16,
  },
});
