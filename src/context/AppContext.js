import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DevSettings, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { LANGUAGE_STORAGE_KEY, ONBOARDING_SEEN_KEY } from '../i18n/constants';
import { supabase } from '../lib/supabase';
import {
  listingFromRow,
  listingToRow,
  agentFromRow,
  profileFromRow,
  boostPaymentFromRow,
  listingReportFromRow,
} from '../lib/mappers';
import { OTP_CHANNEL } from '../utils/otp';
import { phoneToInternalEmail } from '../utils/phoneAuth';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';

const STORAGE_KEY = '@aqari/app_state';

const initialState = {
  auth: { loggedIn: false, name: null, phone: null, avatarUrl: null },
  theme: 'light',
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [auth, setAuth] = useState(initialState.auth);
  const [listings, setListings] = useState([]);
  const [saved, setSaved] = useState([]);
  const [agents, setAgents] = useState([]);
  const [reports, setReports] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [theme, setTheme] = useState(initialState.theme);
  const [language, setLanguageState] = useState(I18nManager.isRTL ? 'ar' : 'en');
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [authUid, setAuthUid] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  // Read from AsyncStorage in the hydrate effect below. App.js gates on
  // `hydrated` before rendering anything, so this is never acted on before
  // the real stored value has landed.
  const [showOnboarding, setShowOnboarding] = useState(false);
  const pendingActionRef = useRef(null);

  // Checks the real, server-side admin allowlist for whichever account is
  // currently signed in — not anything client-side/spoofable.
  const refreshIsAdmin = useCallback(async () => {
    const { data, error } = await supabase.rpc('am_i_admin');
    if (error) {
      console.warn('am_i_admin error', error);
      setIsAdmin(false);
      return;
    }
    setIsAdmin(Boolean(data));
  }, []);

  // Applies a fetched/upserted profiles row to local auth state — the
  // single place that translates "a profile row" into what the UI reads.
  const applyProfile = useCallback((row) => {
    const profile = profileFromRow(row);
    setAuth({ loggedIn: true, name: profile.name, phone: profile.phone, avatarUrl: profile.avatarUrl });
  }, []);

  // Restores a real session left over from a previous launch (persistSession
  // is on in src/lib/supabase.js) and loads that account's profile — auth/role
  // are always derived fresh from the account, never persisted locally
  // themselves, so they can't drift from what's actually true server-side
  // (e.g. an admin-changed role would otherwise show stale on next launch).
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (session) {
        setAuthUid(session.user.id);
        const { data: profileRow, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('auth_uid', session.user.id)
          .maybeSingle();
        if (!error && profileRow) {
          applyProfile(profileRow);
        }
      }
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const persisted = JSON.parse(raw);
        setTheme(persisted.theme ?? initialState.theme);
      }
      const storedLang = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (storedLang) setLanguageState(storedLang);
      const onboardingSeen = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
      setShowOnboarding(onboardingSeen !== 'true');
      setHydrated(true);
    })();
  }, [applyProfile]);

  // Admin status is tied to the real account, not any local state — recheck
  // whenever the underlying session changes (sign in/out).
  useEffect(() => {
    if (!authUid) {
      setIsAdmin(false);
      return;
    }
    refreshIsAdmin();
  }, [authUid, refreshIsAdmin]);

  // Best-effort push token registration — fires whenever a real session
  // exists. registerForPushNotificationsAsync never throws (permission
  // denied / no EAS project id yet / anything else just resolves to null),
  // so this silently does nothing on failure rather than disrupting sign-in.
  // Re-registering on every authUid change is deliberately cheap/idempotent
  // (same token comes back if nothing changed) rather than trying to track
  // "have we already registered this session."
  useEffect(() => {
    if (!authUid || !auth.phone) return;
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (!token) return;
      const { error } = await supabase.from('profiles').update({ push_token: token }).eq('phone', auth.phone);
      if (error) console.warn('push token save error', error);
    })();
  }, [authUid, auth.phone]);

  // Only theme is a pure local UI preference now — everything identity-related
  // (auth/role) always comes fresh from the real account, not this blob.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ theme }));
  }, [hydrated, theme]);

  const fetchListings = useCallback(async () => {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('fetchListings error', error);
      return;
    }
    setListings(data.map(listingFromRow));
  }, []);

  const fetchFavorites = useCallback(async (uid) => {
    if (!uid) {
      setSaved([]);
      return;
    }
    const { data, error } = await supabase
      .from('favorites')
      .select('listing_id')
      .eq('user_id', uid);
    if (error) {
      console.warn('fetchFavorites error', error);
      return;
    }
    setSaved(data.map((row) => row.listing_id));
  }, []);

  const fetchAgents = useCallback(async () => {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('fetchAgents error', error);
      return;
    }
    setAgents(data.map(agentFromRow));
  }, []);

  // Admin-only data (RLS on listing_reports restricts select to
  // private.is_admin() — see migration_listing_reports.sql), so this only
  // fires once isAdmin is actually true, rather than firing for every
  // session and just getting filtered to empty by RLS every time.
  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase
      .from('listing_reports')
      .select('*, listings(title, agent_phone)')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('fetchReports error', error);
      return;
    }
    setReports(data.map(listingReportFromRow));
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setReports([]);
      return;
    }
    fetchReports();
  }, [isAdmin, fetchReports]);

  // Initial load once local prefs are ready, and again whenever the signed-in
  // phone changes — favorites are scoped per-identity server-side, listings
  // aren't. `dataLoading` only reflects listings/favorites — those are the
  // only things Home/Favorites/AgentListings/Approvals actually block their
  // first render on. Agents (admin-only "Registered Agents" page) fetches in
  // the background instead of making every screen wait on data most never touch.
  useEffect(() => {
    if (!hydrated) return;
    setDataLoading(true);
    Promise.all([fetchListings(), fetchFavorites(auth.phone)]).finally(() => setDataLoading(false));
    fetchAgents();
  }, [hydrated, auth.phone, fetchListings, fetchFavorites, fetchAgents]);

  // Changing language flips RTL/LTR, which React Native only applies after a
  // full reload — DevSettings.reload() is a no-op outside dev/Expo Go.
  const setLanguage = useCallback((lang) => {
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    I18nManager.forceRTL(lang === 'ar');
    setLanguageState(lang);
    DevSettings.reload();
  }, []);

  // Gate: runs `action` immediately if signed in, otherwise opens the
  // sign-in/sign-up modal and replays `action` once auth completes.
  const requireAuth = useCallback(
    (action) => {
      if (auth.loggedIn) {
        action?.();
        return true;
      }
      pendingActionRef.current = action ?? null;
      setAuthModalVisible(true);
      return false;
    },
    [auth.loggedIn]
  );

  const closeAuthModal = useCallback(() => {
    pendingActionRef.current = null;
    setAuthModalVisible(false);
  }, []);

  // ACTIVE sign-up/sign-in path — password + synthetic email (see
  // phoneToInternalEmail). The phone-OTP functions below this are built and
  // ready but NOT wired into AuthModal yet — that cutover is paused until
  // Twilio/Supabase's Phone provider is actually configured (see
  // splendid-rolling-hamming.md). Do not remove this pair or point
  // AuthModal back at the OTP path until that setup is confirmed done —
  // doing so before Phone auth is configured locks out every account
  // (confirmed: "Signups not allowed for otp" / "Phone logins are
  // disabled").
  const signUp = useCallback(
    async ({ name, phone, email, password }) => {
      const internalEmail = phoneToInternalEmail(phone);
      const { data, error } = await supabase.auth.signUp({
        email: internalEmail,
        password,
      });
      if (error) throw error;
      if (!data.session) {
        // No session back means this project still requires email
        // confirmation — Dashboard → Authentication → Sign In / Providers →
        // Email → "Confirm email" needs to be off, since phone.aqari.dev
        // addresses are synthetic and can never actually be confirmed by a
        // real person. Failing here (before the profiles insert, which would
        // otherwise silently get blocked by RLS with no session) is what
        // stops this from creating another orphaned auth user with no
        // matching profile row.
        throw new Error('CONFIRM_EMAIL_ENABLED');
      }
      const uid = data.session.user.id;
      setAuthUid(uid);

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .upsert({ phone, name, email, auth_uid: uid })
        .select()
        .single();
      if (profileError) throw profileError;
      applyProfile(profileRow);
      refreshIsAdmin();

      setAuthModalVisible(false);
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      pending?.();
    },
    [applyProfile, refreshIsAdmin]
  );

  const signIn = useCallback(
    async ({ phone, password }) => {
      const internalEmail = phoneToInternalEmail(phone);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password,
      });
      if (error) throw error;
      const uid = data.user.id;

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_uid', uid)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profileRow) {
        // The auth account exists (password just checked out) but its
        // profiles row never got written — a signUp that created the auth
        // user then died before the profile upsert (hit the confirm-email
        // gate, the mailer rate limit, or was interrupted). Surface this
        // loudly instead of silently closing the modal with nothing
        // signed in, which is what happened before this check existed.
        await supabase.auth.signOut();
        throw new Error('NO_PROFILE');
      }
      setAuthUid(uid);
      applyProfile(profileRow);
      refreshIsAdmin();

      setAuthModalVisible(false);
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      pending?.();
    },
    [applyProfile, refreshIsAdmin]
  );

  // Phone-OTP path — built, not yet active (see note above). `isNewAccount`
  // maps straight to Supabase's own `shouldCreateUser`:
  // signup creates the auth.users row on send, sign-in rejects unknown
  // numbers instead of silently creating one. Verification (verifyPhoneOtp
  // below) is what actually establishes a session.
  const sendPhoneOtp = useCallback(async (phone, { isNewAccount }) => {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: OTP_CHANNEL, shouldCreateUser: isNewAccount },
    });
    if (error) throw error;
  }, []);

  // Verifies the code from sendPhoneOtp and establishes the session — but
  // does NOT close the auth modal or resolve the pending action itself.
  // `type: 'sms'` is correct even for WhatsApp-delivered codes — Supabase
  // has no separate whatsapp verify type, channel only affects delivery,
  // not verification. Returns whether this account still needs a profile
  // (brand new signup) so AuthModal can ask for a name before finishing —
  // see completeSignupProfile/finishSignIn below.
  const verifyPhoneOtp = useCallback(async ({ phone, token }) => {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) throw error;
    const uid = data.user.id;
    setAuthUid(uid);

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_uid', uid)
      .maybeSingle();
    if (profileError) throw profileError;

    return { uid, phone, profile: profileRow };
  }, []);

  // Called after verifyPhoneOtp when profile is null (brand new account) —
  // AuthModal collects the name in between, then this creates the row and
  // finishes signing in the same way finishSignIn does for existing ones.
  const completeSignupProfile = useCallback(
    async ({ uid, phone, name }) => {
      const { data: inserted, error } = await supabase
        .from('profiles')
        .upsert({ phone, name, auth_uid: uid })
        .select()
        .single();
      if (error) throw error;
      applyProfile(inserted);
      refreshIsAdmin();

      setAuthModalVisible(false);
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      pending?.();
    },
    [applyProfile, refreshIsAdmin]
  );

  // Called after verifyPhoneOtp when profile already exists (returning
  // account) — no extra step needed, finish immediately.
  const finishSignIn = useCallback(
    (profileRow) => {
      applyProfile(profileRow);
      refreshIsAdmin();

      setAuthModalVisible(false);
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      pending?.();
    },
    [applyProfile, refreshIsAdmin]
  );

  // Optional convenience login for accounts that set a password after
  // verifying their phone (see updateAccountPassword below) — phone/OTP
  // always works regardless, this is purely a faster-entry fallback.
  const signInWithPassword = useCallback(
    async ({ phone, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error) throw error;
      const uid = data.user.id;

      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_uid', uid)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profileRow) {
        await supabase.auth.signOut();
        throw new Error('NO_PROFILE');
      }
      setAuthUid(uid);
      applyProfile(profileRow);
      refreshIsAdmin();

      setAuthModalVisible(false);
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      pending?.();
    },
    [applyProfile, refreshIsAdmin]
  );

  // Lets a signed-in account set/change a password, purely as an optional
  // faster-entry fallback alongside phone/OTP (which always keeps working
  // regardless — there's no "forgot password" needed for this, since OTP
  // itself is the ultimate recovery path).
  const updateAccountPassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  // Legacy path — only the admin account (grandfathered past
  // migration_cleanup_users_for_phone_auth.sql) still has the synthetic
  // phone.aqari.dev email identity this depends on. Every account created
  // after the phone-OTP cutover has no email identity at all, so "forgot
  // password" doesn't apply to them — phone/OTP itself is always available
  // as the recovery path instead. Delegates to the send-password-reset Edge
  // Function rather than calling supabase.auth.resetPasswordForEmail
  // directly, since Supabase's own mailer can only ever deliver to an
  // account's own registered (synthetic) email; the Edge Function mints a
  // recovery token via the admin API and emails it to the real address via
  // Resend. Linking.createURL (not a hardcoded "aqari://…" string) is
  // required here — it resolves to exp://<ip>:<port>/--/reset-password
  // while running in Expo Go during development, and only becomes a real
  // aqari://reset-password link in an actual standalone/EAS build.
  const sendPasswordReset = useCallback(async (phone) => {
    const { data, error } = await supabase.functions.invoke('send-password-reset', {
      body: { phone, redirectTo: Linking.createURL('reset-password') },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  }, []);

  // Called from ResetPasswordScreen once a recovery session is active.
  const updatePasswordAfterReset = useCallback(
    async (newPassword) => {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // The recovery session is a genuine session for their account, so pick
      // up their profile/role and drop into the app normally — no need to
      // make them log in again right after they just proved account ownership.
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (uid) {
        setAuthUid(uid);
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('*')
          .eq('auth_uid', uid)
          .maybeSingle();
        if (profileRow) applyProfile(profileRow);
        refreshIsAdmin();
      }
      setIsPasswordRecovery(false);
    },
    [applyProfile, refreshIsAdmin]
  );

  // The reset email's link (built by the send-password-reset Edge Function)
  // deep-links back into the app as
  // aqari://reset-password?token_hash=...&type=recovery — a single-use
  // token minted via the admin API, redeemed here via verifyOtp. This isn't
  // the PKCE code_verifier flow (admin.generateLink doesn't support that
  // regardless of the client's flowType setting), but it's still a
  // single-use, short-lived, server-verified token — not a raw session.
  // Called from App.js's Linking listener.
  const handleAuthDeepLink = useCallback(async (url) => {
    if (!url || !url.includes('reset-password')) return;
    const query = url.split('#')[1] ?? url.split('?')[1];
    if (!query) return;
    const params = new URLSearchParams(query);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (!tokenHash || type !== 'recovery') return;
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error) {
      console.warn('recovery verifyOtp error', error);
      return;
    }
    setIsPasswordRecovery(true);
  }, []);

  const updateProfile = useCallback(
    async ({ name, avatarUrl }) => {
      if (!auth.phone) return;
      setAuth((prev) => ({
        ...prev,
        ...(name !== undefined ? { name } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      }));
      const row = { phone: auth.phone, name: name ?? auth.name };
      if (avatarUrl !== undefined) row.avatar_url = avatarUrl;
      const { error } = await supabase.from('profiles').upsert(row);
      if (error) console.warn('updateProfile error', error);
    },
    [auth.phone, auth.name]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setAuth(initialState.auth);
    setAuthUid(null);
    setIsAdmin(false);
  }, []);

  // Actually deletes the account (not just local state) — the auth.users row
  // itself, via the delete-account Edge Function (see supabase/functions),
  // since that requires the service_role key and can never be done directly
  // from the app. profiles/favorites/agents cascade-delete and listings lose
  // their owner_id automatically server-side (FKs in schema.sql); the local
  // sign-out here is just cleaning up this device's now-dead session.
  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) throw error;
    await supabase.auth.signOut();
    setAuth(initialState.auth);
    setAuthUid(null);
    setIsAdmin(false);
  }, []);

  // Admin-only at the RLS level (agents delete requires private.is_admin()) —
  // just removes the directory entry, doesn't touch that agent's listings.
  const removeAgent = useCallback(async (phone) => {
    setAgents((prev) => prev.filter((agent) => agent.phone !== phone));
    const { error } = await supabase.from('agents').delete().eq('phone', phone);
    if (error) console.warn('removeAgent error', error);
  }, []);

  // Lets any signed-in account flag a listing for admin review. Throws on
  // failure (per the submitListing lesson — a silent failure here would look
  // exactly like a successful report to the user, with no actual row
  // created). No local list to update — reporters never see reports back,
  // only admin does (fetchReports above).
  const reportListing = useCallback(
    async (listingId, reason, note) => {
      const { error } = await supabase.from('listing_reports').insert({
        listing_id: listingId,
        reporter_owner_id: authUid,
        reason,
        note: note?.trim() || null,
      });
      if (error) throw error;
    },
    [authUid]
  );

  // Admin-only at the RLS level (listing_reports update requires
  // private.is_admin()) — marks a report reviewed or dismissed after triage.
  const updateReportStatus = useCallback(async (reportId, status) => {
    setReports((prev) => prev.map((item) => (item.id === reportId ? { ...item, status } : item)));
    const { error } = await supabase.from('listing_reports').update({ status }).eq('id', reportId);
    if (error) console.warn('updateReportStatus error', error);
  }, []);

  // Admin-only at the RLS/RPC level (admin_set_agent_verified checks
  // private.is_admin() internally, and the client has no direct UPDATE
  // grant on the verified column regardless — see migration_agent_verified.sql).
  const setAgentVerified = useCallback(async (phone, verified) => {
    setAgents((prev) => prev.map((agent) => (agent.phone === phone ? { ...agent, verified } : agent)));
    const { error } = await supabase.rpc('admin_set_agent_verified', { p_phone: phone, p_verified: verified });
    if (error) console.warn('setAgentVerified error', error);
  }, []);

  // Written before hiding, not after — if the write somehow failed we'd
  // rather show onboarding again next launch than dismiss it forever on a
  // device where the flag never actually persisted.
  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    setShowOnboarding(false);
  }, []);

  // "How it works" in Settings — replays the intro immediately rather than
  // only on next launch, by clearing the flag and flipping state in step.
  const replayOnboarding = useCallback(async () => {
    await AsyncStorage.removeItem(ONBOARDING_SEEN_KEY);
    setShowOnboarding(true);
  }, []);

  // The signed-in phone number is this device's real per-person identity.
  const getMyId = useCallback(() => auth.phone ?? null, [auth.phone]);

  const toggleSave = useCallback(
    (listingId) => {
      requireAuth(() => {
        const uid = getMyId();
        const alreadySaved = saved.includes(listingId);
        setSaved((prev) =>
          alreadySaved ? prev.filter((id) => id !== listingId) : [...prev, listingId]
        );
        const query = alreadySaved
          ? supabase.from('favorites').delete().eq('user_id', uid).eq('listing_id', listingId)
          : supabase.from('favorites').insert({ user_id: uid, listing_id: listingId, owner_id: authUid });
        query.then(({ error }) => {
          if (error) console.warn('toggleSave error', error);
        });
      });
    },
    [requireAuth, getMyId, saved, authUid]
  );

  // Listing cap removed for now (agents can add unlimited listings) — subscription
  // tiers are a future-phase feature per the product doc, not decided yet.
  // `ownerId` (the real account's auth uid) is what RLS actually checks on
  // update/delete — `agentId` (phone) stays the human-facing "my listings"
  // filter used throughout the UI, unchanged.
  const submitListing = useCallback(
    async (data) => {
      const agentId = getMyId();
      // No explicit status here — INSERT privilege on that column is
      // revoked for authenticated (see migration_fix_listings_column_
      // lockdown.sql), so it's left out entirely and picks up the column's
      // own 'pending' default server-side instead of being client-set.
      const row = listingToRow({ ...data, agentId, ownerId: authUid });
      const { data: inserted, error } = await supabase
        .from('listings')
        .insert(row)
        .select()
        .single();
      if (error) {
        console.warn('submitListing error', error);
        throw error;
      }
      const listing = listingFromRow(inserted);
      setListings((prev) => [listing, ...prev]);

      // Anyone who lists gets into the "Registered Sellers" directory admin
      // sees — keyed by the account's own identity, not whatever contact
      // number this particular listing used (that's just agentId/agentPhone
      // above, editable per-listing).
      supabase
        .from('agents')
        .upsert({ phone: agentId, name: auth.name, owner_id: authUid })
        .then(({ error: agentError }) => {
          if (agentError) {
            console.warn('seller directory upsert error', agentError);
            return;
          }
          // Preserve an existing verified flag — this upsert never touches
          // that column (grant only covers phone/name/owner_id, see
          // migration_agent_verified.sql), so the local optimistic update
          // shouldn't silently drop it either.
          setAgents((prev) => [
            { phone: agentId, name: auth.name, verified: prev.find((a) => a.phone === agentId)?.verified ?? false },
            ...prev.filter((a) => a.phone !== agentId),
          ]);
        });

      return listing;
    },
    [getMyId, authUid, auth.name]
  );

  const updateListing = useCallback(async (listingId, data) => {
    const row = listingToRow(data);
    const { data: updated, error } = await supabase
      .from('listings')
      .update(row)
      .eq('id', listingId)
      .select()
      .single();
    if (error) {
      console.warn('updateListing error', error);
      throw error;
    }
    const listing = listingFromRow(updated);
    setListings((prev) => prev.map((item) => (item.id === listingId ? listing : item)));
  }, []);

  // status is column-locked from a plain client update (see migration_fix_
  // listings_column_lockdown.sql) — admin_set_listing_status is the only
  // path left, security-definer + private.is_admin()-gated internally.
  const approveListing = useCallback(async (listingId) => {
    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, status: 'approved' } : item))
    );
    const { error } = await supabase.rpc('admin_set_listing_status', {
      p_listing_id: listingId,
      p_status: 'approved',
    });
    if (error) console.warn('approveListing error', error);
  }, []);

  // Marks the listing rejected (visible to the agent, colored red) rather than
  // deleting it outright — admin has a separate deleteListing for outright removal.
  const rejectListing = useCallback(async (listingId) => {
    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, status: 'rejected' } : item))
    );
    const { error } = await supabase.rpc('admin_set_listing_status', {
      p_listing_id: listingId,
      p_status: 'rejected',
    });
    if (error) console.warn('rejectListing error', error);
  }, []);

  // Owner-gated (not admin-gated) — the seller's own "fix and resubmit" path
  // after a rejection, same column-lockdown reasoning as above but via
  // resubmit_rejected_listing instead, which only ever moves rejected ->
  // pending and refuses anything else server-side.
  const resubmitRejectedListing = useCallback(async (listingId) => {
    const { error } = await supabase.rpc('resubmit_rejected_listing', { p_listing_id: listingId });
    if (error) throw error;
    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, status: 'pending' } : item))
    );
  }, []);

  const deleteListing = useCallback(async (listingId) => {
    setListings((prev) => prev.filter((item) => item.id !== listingId));
    const { error } = await supabase.from('listings').delete().eq('id', listingId);
    if (error) console.warn('deleteListing error', error);
  }, []);

  // Free 30-day renewal — security-definer RPC (checks owner_id itself), the
  // only path allowed to touch listing_state/expires_at/renewed_at now that
  // migration_listing_lifecycle.sql revokes direct client UPDATE on them.
  const renewListing = useCallback(async (listingId) => {
    const { error } = await supabase.rpc('renew_listing', { p_listing_id: listingId });
    if (error) throw error;
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    setListings((prev) =>
      prev.map((item) =>
        item.id === listingId
          ? { ...item, listingState: 'active', expiresAt, renewedAt: nowIso }
          : item
      )
    );
  }, []);

  // One-way — same security-definer, owner-gated RPC pattern as
  // renewListing. Nothing to undo from the app side; a sold listing stays
  // sold (matches mark_listing_sold's own doc comment in schema.sql).
  const markListingSold = useCallback(async (listingId) => {
    const { error } = await supabase.rpc('mark_listing_sold', { p_listing_id: listingId });
    if (error) throw error;
    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, listingState: 'sold' } : item))
    );
  }, []);

  // Reverses markListingSold — a deliberate seller action (see
  // mark_listing_available's own comment for why it's not automatic).
  // Refreshes expiresAt locally to match what the RPC itself does server-side.
  const markListingAvailable = useCallback(async (listingId) => {
    const { error } = await supabase.rpc('mark_listing_available', { p_listing_id: listingId });
    if (error) throw error;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    setListings((prev) =>
      prev.map((item) =>
        item.id === listingId ? { ...item, listingState: 'active', expiresAt } : item
      )
    );
  }, []);

  // Opens a Dpay payment session for Featured (server looks up the real
  // price and confirms listing ownership — never trusts amount/ownership
  // from the client). Returns Dpay's session info so the UI can show an OTP
  // field (EDFali/Sadad) or open payment_link in-app (Moamalat).
  const createBoostPayment = useCallback(async (params) => {
    const { data, error } = await supabase.functions.invoke('create-boost-payment', {
      body: params,
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  // Submits the OTP the seller received from their wallet — forwarded to
  // Dpay server-to-server, never sent anywhere from the client except here.
  const verifyBoostPayment = useCallback(
    async (sessionId, otp) => {
      const { data, error } = await supabase.functions.invoke('verify-boost-payment', {
        body: { session_id: sessionId, otp },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await fetchListings();
      return data;
    },
    [fetchListings]
  );

  // Payment history — fetched on demand by the Payment History screen
  // rather than kept in always-loaded state, since it's not needed anywhere
  // else. RLS alone decides the scope: a seller's own rows for a regular
  // account, every row for admin (see migration_admin_read_boost_payments.sql)
  // — same query works for both, nothing to branch on client-side.
  const fetchBoostPayments = useCallback(async () => {
    const { data, error } = await supabase
      .from('boost_payment_sessions')
      .select('*, listings(title, listing_type, agent_phone)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(boostPaymentFromRow);
  }, []);

  const value = {
    auth,
    authUid,
    listings,
    saved,
    agents,
    removeAgent,
    setAgentVerified,
    reports,
    reportListing,
    updateReportStatus,
    isAdmin,
    dataLoading,
    theme,
    setTheme,
    language,
    setLanguage,
    authModalVisible,
    hydrated,
    toggleSave,
    requireAuth,
    closeAuthModal,
    signUp,
    signIn,
    sendPhoneOtp,
    verifyPhoneOtp,
    completeSignupProfile,
    finishSignIn,
    signInWithPassword,
    updateAccountPassword,
    sendPasswordReset,
    updatePasswordAfterReset,
    isPasswordRecovery,
    showOnboarding,
    completeOnboarding,
    replayOnboarding,
    handleAuthDeepLink,
    updateProfile,
    logout,
    deleteAccount,
    submitListing,
    updateListing,
    approveListing,
    rejectListing,
    resubmitRejectedListing,
    deleteListing,
    getMyId,
    renewListing,
    markListingSold,
    markListingAvailable,
    fetchListings,
    createBoostPayment,
    verifyBoostPayment,
    fetchBoostPayments,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return ctx;
}
