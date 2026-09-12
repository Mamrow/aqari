import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, DevSettings, I18nManager, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';

const STORAGE_KEY = '@aqari/app_state';

const initialState = {
  auth: {
    loggedIn: false,
    name: null,
    phone: null,
    email: null,
    avatarUrl: null,
    notifyNewListings: false,
    notifyCities: [],
    notifyDistricts: [],
  },
  theme: 'light',
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [auth, setAuth] = useState(initialState.auth);
  const [listings, setListings] = useState([]);
  const [saved, setSaved] = useState([]);
  const [blockedSellers, setBlockedSellers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [reports, setReports] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataErrors, setDataErrors] = useState({});
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  // themePreference is the raw, persisted choice — 'light' | 'dark' | 'system'
  // — shown/selected in Settings. `theme` below (what every screen actually
  // renders with) is that preference resolved to a real 'light'/'dark',
  // following the OS setting live when the preference is 'system' — this
  // needs to be a hook (not read once) so the app actually re-renders the
  // moment the user flips their OS-level appearance, not just on next launch.
  const [themePreference, setThemePreference] = useState(initialState.theme);
  const systemColorScheme = useColorScheme();
  const theme =
    themePreference === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : themePreference;
  const [language, setLanguageState] = useState(I18nManager.isRTL ? 'ar' : 'en');
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [authUid, setAuthUid] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
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
    setAuth({
      loggedIn: true,
      name: profile.name,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl,
      email: profile.email,
      notifyNewListings: profile.notifyNewListings,
      notifyCities: profile.notifyCities,
      notifyDistricts: profile.notifyDistricts,
    });
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
        setThemePreference(persisted.theme ?? initialState.theme);
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
  // Persists the raw preference ('system' included), not the resolved
  // light/dark — resolving from a saved 'system' on next launch is exactly
  // what lets it keep following the OS setting across app restarts.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: themePreference }));
  }, [hydrated, themePreference]);

  const recordDataError = useCallback((key, error) => {
    console.warn(`${key} data error`, error);
    setDataErrors((prev) => ({ ...prev, [key]: error }));
  }, []);

  const clearDataError = useCallback((key) => {
    setDataErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const fetchListings = useCallback(async () => {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      recordDataError('listings', error);
      return;
    }
    clearDataError('listings');
    setListings((data ?? []).map(listingFromRow));
  }, [clearDataError, recordDataError]);

  const fetchFavorites = useCallback(async (uid) => {
    if (!uid) {
      clearDataError('favorites');
      setSaved([]);
      return;
    }
    const { data, error } = await supabase
      .from('favorites')
      .select('listing_id')
      .eq('user_id', uid);
    if (error) {
      recordDataError('favorites', error);
      return;
    }
    clearDataError('favorites');
    setSaved((data ?? []).map((row) => row.listing_id));
  }, [clearDataError, recordDataError]);

  // Own account's block list — owner_id-keyed (real account), not phone, per
  // migration_blocked_sellers.sql. Background fetch like fetchAgents, not
  // part of the dataLoading gate: nothing on first render depends on it.
  const fetchBlockedSellers = useCallback(async (uid) => {
    if (!uid) {
      clearDataError('blockedSellers');
      setBlockedSellers([]);
      return;
    }
    const { data, error } = await supabase
      .from('blocked_sellers')
      .select('blocked_phone')
      .eq('owner_id', uid);
    if (error) {
      recordDataError('blockedSellers', error);
      return;
    }
    clearDataError('blockedSellers');
    setBlockedSellers((data ?? []).map((row) => row.blocked_phone));
  }, [clearDataError, recordDataError]);

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        recordDataError('agents', error);
        return;
      }
      clearDataError('agents');
      setAgents((data ?? []).map(agentFromRow));
    } finally {
      setAgentsLoading(false);
    }
  }, [clearDataError, recordDataError]);

  // Admin-only data (RLS on listing_reports restricts select to
  // private.is_admin() — see migration_listing_reports.sql), so this only
  // fires once isAdmin is actually true, rather than firing for every
  // session and just getting filtered to empty by RLS every time.
  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const { data, error } = await supabase
        .from('listing_reports')
        .select('*, listings(title, agent_phone)')
        .order('created_at', { ascending: false });
      if (error) {
        recordDataError('reports', error);
        return;
      }
      clearDataError('reports');
      setReports((data ?? []).map(listingReportFromRow));
    } finally {
      setReportsLoading(false);
    }
  }, [clearDataError, recordDataError]);

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

  // Keyed on authUid rather than auth.phone (see fetchBlockedSellers) — its
  // own effect since it changes on a different signal than the phone-scoped
  // fetches above.
  useEffect(() => {
    fetchBlockedSellers(authUid);
  }, [authUid, fetchBlockedSellers]);

  // Changing language flips RTL/LTR, and React Native only applies a
  // direction change when the app restarts — forceRTL on its own updates a
  // flag that nothing re-reads until the native root is rebuilt. Until this
  // used Updates.reloadAsync, that restart never happened in a release build:
  // DevSettings.reload() is a no-op outside dev, so switching to English on
  // TestFlight swapped the strings while leaving the whole app laid out
  // right-to-left — reversed tab bar, headings against the wrong edge,
  // English text in an Arabic layout.
  //
  // Three tiers, because no single one covers every build: reloadAsync works
  // in release builds, DevSettings.reload in dev, and if somehow neither
  // does, say so rather than leaving someone staring at a half-flipped app
  // wondering whether the button worked.
  const setLanguage = useCallback(
    async (lang) => {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      // Both, and in this order — see the note in App.js. forceRTL alone
      // leaves an English app inheriting an Arabic phone's RTL layout.
      I18nManager.allowRTL(lang === 'ar');
      I18nManager.forceRTL(lang === 'ar');
      setLanguageState(lang);

      try {
        // Required lazily, inside the try, on purpose: expo-updates is a
        // native module, so a client built before it was added throws
        // "Cannot find native module 'ExpoUpdates'" the moment this module
        // is imported. At the top of the file that error is uncatchable and
        // takes the whole app down; here it's just a failed tier.
        const Updates = require('expo-updates');
        await Updates.reloadAsync();
        return;
      } catch (error) {
        console.warn('Updates.reloadAsync unavailable, falling back', error);
      }

      if (DevSettings?.reload) {
        DevSettings.reload();
        return;
      }

      Alert.alert(
        lang === 'ar' ? 'إعادة تشغيل مطلوبة' : 'Restart needed',
        lang === 'ar'
          ? 'أغلق التطبيق وافتحه مرة أخرى لتطبيق تغيير اللغة.'
          : 'Close and reopen the app to apply the language change.'
      );
    },
    []
  );

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

  // Everything that has to happen once a session exists, whichever door the
  // user came through: password sign-in, sign-up verification, or a password
  // reset. Passing `name` is what distinguishes "create this account's
  // profile" from "load the existing one" — only the sign-up path knows a
  // name, and only the sign-up path is allowed to write one.
  const completeAuthedSession = useCallback(
    async ({ uid, phone, name }) => {
      setAuthUid(uid);

      let profileRow;
      if (name) {
        const { data, error } = await supabase
          .from('profiles')
          .upsert({ phone, name, auth_uid: uid })
          .select()
          .single();
        if (error) throw error;
        profileRow = data;
      } else {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('auth_uid', uid)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          // The auth account exists but its profiles row doesn't. That
          // happens when a sign-up creates the account and then dies before
          // the profile insert — and it used to be terminal: the number was
          // taken, so sign-up said "already registered", while sign-in said
          // "account incomplete". No way out from inside the app.
          //
          // It's recoverable, though. Whoever is holding this session just
          // proved they own the account with its password, and the only
          // thing missing is a name. Hand that back to the caller so it can
          // ask for one, rather than signing out and dead-ending. Not signed
          // out here on purpose: the session is exactly what makes writing
          // the profile allowed under RLS.
          const incomplete = new Error('PROFILE_INCOMPLETE');
          incomplete.uid = uid;
          incomplete.phone = phone ?? null;
          throw incomplete;
        }
        profileRow = data;
      }

      applyProfile(profileRow);
      refreshIsAdmin();

      setAuthModalVisible(false);
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      pending?.();
    },
    [applyProfile, refreshIsAdmin]
  );

  // Sign-up is phone + password, with a one-time code proving the number is
  // really theirs. Supabase's own phone provider handles delivery — the
  // Twilio credentials live in the Supabase dashboard, never in this app, so
  // there's no Twilio SDK here and no auth token shipped to devices.
  //
  // No session comes back from this call: the account is unverified until
  // verifySignUpOtp redeems the code. The name deliberately isn't written
  // yet either, so abandoning the code screen leaves no profile row behind.
  const signUp = useCallback(
    async ({ name, phone, password }) => {
      const { data, error } = await supabase.auth.signUp({
        phone,
        password,
        options: { channel: OTP_CHANNEL },
      });
      if (error) throw error;
      if (data.session) {
        // "Confirm phone" is switched off in the project, so Supabase handed
        // back a session without ever sending a code. Finish the account here
        // rather than stranding it behind a code screen that will never
        // receive anything — but this is a misconfiguration worth fixing in
        // Authentication → Sign In / Providers → Phone.
        await completeAuthedSession({ uid: data.session.user.id, phone, name });
        return { verified: true };
      }
      return { verified: false };
    },
    [completeAuthedSession]
  );

  // Redeems the sign-up code and, with the session it establishes, writes the
  // profile. `type: 'sms'` is correct even for a WhatsApp-delivered code —
  // Supabase has no separate whatsapp verify type; the channel only affects
  // how the message is delivered, not how the code is checked.
  const verifySignUpOtp = useCallback(
    async ({ phone, token, name }) => {
      const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
      if (error) throw error;
      await completeAuthedSession({ uid: data.user.id, phone, name });
    },
    [completeAuthedSession]
  );

  // Day-to-day sign-in: phone + password, no code. The code is only ever a
  // proof-of-ownership step (sign-up, and password reset below), which keeps
  // the per-message cost off the common path.
  const signIn = useCallback(
    async ({ phone, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error) throw error;
      // Pass the phone through so a PROFILE_INCOMPLETE recovery knows which
      // number to write, without having to re-read the session for it.
      await completeAuthedSession({ uid: data.user.id, phone });
    },
    [completeAuthedSession]
  );

  /**
   * Finishes an account whose auth row exists but whose profile never got
   * written — see PROFILE_INCOMPLETE in completeAuthedSession. Takes the name
   * the user just supplied and writes the row the failed sign-up should have.
   */
  const completeMissingProfile = useCallback(
    async ({ uid, phone, name }) => {
      await completeAuthedSession({ uid, phone, name });
    },
    [completeAuthedSession]
  );

  // Password reset without email: prove the number, then set a new password.
  // `shouldCreateUser: false` is the load-bearing part — without it an
  // unknown number would silently get an account created for it, turning
  // "forgot password" into an accidental sign-up.
  const sendPasswordResetCode = useCallback(async (phone) => {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: OTP_CHANNEL, shouldCreateUser: false },
    });
    if (error) throw error;
  }, []);

  // Redeeming the code establishes a real session for the account, which is
  // exactly the authority needed to change its password — so this needs no
  // service-role key, no admin API, and no emailed link. (The old flow did
  // need all three, and carried an unvalidated redirect in the emailed link
  // as a result; deleting it removes that whole class of problem.)
  const resetPasswordWithOtp = useCallback(
    async ({ phone, token, newPassword }) => {
      const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
      if (error) throw error;
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await completeAuthedSession({ uid: data.user.id });
    },
    [completeAuthedSession]
  );

  // Lets an already signed-in account change its password from Settings.
  const updateAccountPassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  /**
   * New-listing alert preferences. Its own updater rather than a branch of
   * updateProfile: that one writes name/avatar/email, and folding the array
   * columns into it would mean every avatar change rewriting the city list
   * too.
   *
   * Still an upsert keyed on phone, unlike updateProfile — if a save here
   * ever reports an error while appearing to work, it's the same cause, and
   * the same fix applies.
   */
  const updateNotificationPrefs = useCallback(
    async ({ notifyNewListings, notifyCities, notifyDistricts }) => {
      if (!auth.phone) return;
      setAuth((prev) => ({
        ...prev,
        ...(notifyNewListings !== undefined ? { notifyNewListings } : {}),
        ...(notifyCities !== undefined ? { notifyCities } : {}),
        ...(notifyDistricts !== undefined ? { notifyDistricts } : {}),
      }));
      const row = { phone: auth.phone };
      if (notifyNewListings !== undefined) row.notify_new_listings = notifyNewListings;
      if (notifyCities !== undefined) row.notify_cities = notifyCities;
      if (notifyDistricts !== undefined) row.notify_districts = notifyDistricts;
      const { error } = await supabase.from('profiles').upsert(row);
      if (error) console.warn('updateNotificationPrefs error', error);
    },
    [auth.phone]
  );

  /**
   * Edits the signed-in account's own profile row.
   *
   * An update keyed on auth_uid, not an upsert. Every caller here is editing
   * a profile that already exists, and an upsert has to satisfy the INSERT
   * policy as well as the UPDATE one — which means sending auth_uid on a row
   * that already has it, to prove ownership of a row we aren't creating. The
   * update policy (auth_uid = auth.uid()) says exactly what we mean, and the
   * filter and the policy are then the same condition.
   *
   * Local state is set *after* the write lands, not before. Optimistically
   * updating first meant a failed save still renamed you on screen: the
   * error alert and the new name appeared together, and the old name came
   * back at the next launch with nothing to explain it.
   */
  const updateProfile = useCallback(
    async ({ name, avatarUrl, email }) => {
      if (!authUid) return;
      const patch = {};
      if (name !== undefined) patch.name = name;
      if (avatarUrl !== undefined) patch.avatar_url = avatarUrl;
      // An emptied field means "remove it", which is null in the column, not
      // an empty string — otherwise "has an email" checks start being true
      // for people who cleared theirs.
      if (email !== undefined) patch.email = email?.trim() ? email.trim() : null;
      if (Object.keys(patch).length === 0) return;

      // Returning the row is what proves it was actually written. A filter
      // that matches nothing is not an error in Postgres, so without this a
      // no-op update would report success.
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('auth_uid', authUid)
        .select('phone')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Profile row not found for this account');

      setAuth((prev) => ({
        ...prev,
        ...(name !== undefined ? { name } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(email !== undefined ? { email } : {}),
      }));
    },
    [authUid]
  );

  /**
   * Changes the number the account signs in with.
   *
   * Two steps or one, depending on the project's "Confirm phone" setting:
   * with it on, Supabase sends a code to the NEW number and nothing changes
   * until verifyPhoneChange redeems it; with it off, the change lands
   * immediately. Either way the profiles row is only rewritten once auth
   * itself has accepted the new number — doing it the other way round would
   * leave the profile pointing at a number that can't sign in.
   *
   * Existing listings keep the contact number they were published with.
   * That's deliberate: agent_phone is a snapshot of how to reach the seller
   * about that listing, not a live reference, so changing an account's login
   * number doesn't silently rewrite adverts other people are looking at.
   */
  const changePhoneNumber = useCallback(async (newPhone) => {
    const { data, error } = await supabase.auth.updateUser({ phone: newPhone });
    if (error) throw error;
    const confirmed = data?.user?.phone === newPhone.replace('+', '');
    if (!confirmed) return { needsVerification: true };
    await finishPhoneChange(newPhone);
    return { needsVerification: false };
  }, []);

  const finishPhoneChange = async (newPhone) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) throw new Error('NO_SESSION');
    const { data: row, error } = await supabase
      .from('profiles')
      .update({ phone: newPhone })
      .eq('auth_uid', uid)
      .select()
      .single();
    if (error) throw error;
    setAuth((prev) => ({ ...prev, phone: row.phone }));
  };

  /** Redeems the code sent to the new number — `type: 'phone_change'`. */
  const verifyPhoneChange = useCallback(async ({ phone, token }) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' });
    if (error) throw error;
    await finishPhoneChange(phone);
  }, []);

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
  const removeAgent = useCallback(
    async (phone) => {
      const previousAgent = agents.find((agent) => agent.phone === phone);
      setAgents((prev) => prev.filter((agent) => agent.phone !== phone));
      const { error } = await supabase.from('agents').delete().eq('phone', phone);
      if (error) {
        if (previousAgent) setAgents((prev) => (prev.some((agent) => agent.phone === phone) ? prev : [previousAgent, ...prev]));
        throw error;
      }
    },
    [agents]
  );

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
  const updateReportStatus = useCallback(
    async (reportId, status) => {
      const previousStatus = reports.find((item) => item.id === reportId)?.status;
      setReports((prev) => prev.map((item) => (item.id === reportId ? { ...item, status } : item)));
      const { error } = await supabase.from('listing_reports').update({ status }).eq('id', reportId);
      if (error) {
        if (previousStatus) {
          setReports((prev) => prev.map((item) => (item.id === reportId ? { ...item, status: previousStatus } : item)));
        }
        throw error;
      }
    },
    [reports]
  );

  // Admin-only at the RLS level (listing_reports delete requires
  // private.is_admin(), see migration_listing_reports_admin_delete.sql) —
  // lets admin clear a report out of the queue entirely instead of just
  // marking it reviewed/dismissed.
  const deleteReport = useCallback(
    async (reportId) => {
      const previousReport = reports.find((item) => item.id === reportId);
      const previousIndex = reports.findIndex((item) => item.id === reportId);
      setReports((prev) => prev.filter((item) => item.id !== reportId));
      const { error } = await supabase.from('listing_reports').delete().eq('id', reportId);
      if (error) {
        if (previousReport) {
          setReports((prev) => {
            if (prev.some((item) => item.id === reportId)) return prev;
            const next = [...prev];
            next.splice(previousIndex, 0, previousReport);
            return next;
          });
        }
        throw error;
      }
    },
    [reports]
  );

  // Admin-only at the RLS/RPC level (admin_set_agent_verified checks
  // private.is_admin() internally, and the client has no direct UPDATE
  // grant on the verified column regardless — see migration_agent_verified.sql).
  const setAgentVerified = useCallback(
    async (phone, verified) => {
      const previousVerified = agents.find((agent) => agent.phone === phone)?.verified;
      setAgents((prev) => prev.map((agent) => (agent.phone === phone ? { ...agent, verified } : agent)));
      const { error } = await supabase.rpc('admin_set_agent_verified', { p_phone: phone, p_verified: verified });
      if (error) {
        setAgents((prev) => prev.map((agent) => (agent.phone === phone ? { ...agent, verified: previousVerified } : agent)));
        throw error;
      }
    },
    [agents]
  );

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
          if (!error) return;
          recordDataError('favorites', error);
          setSaved((prev) =>
            alreadySaved
              ? prev.includes(listingId)
                ? prev
                : [...prev, listingId]
              : prev.filter((id) => id !== listingId)
          );
        });
      });
    },
    [requireAuth, getMyId, saved, authUid, recordDataError]
  );

  // Block/unblock a seller (Apple Guideline 1.2 UGC safety: report + block).
  // Contact itself (call/WhatsApp) happens outside the app so blocking can't
  // prevent that directly — what it actually does is drop that seller's
  // listings from buyer-facing browsing (HomeMapScreen/FavoritesScreen).
  // Optimistic like toggleSave, same rollback-on-error shape.
  const blockSeller = useCallback(
    (phone) => {
      requireAuth(() => {
        if (blockedSellers.includes(phone)) return;
        setBlockedSellers((prev) => [...prev, phone]);
        supabase
          .from('blocked_sellers')
          .insert({ owner_id: authUid, blocked_phone: phone })
          .then(({ error }) => {
            if (!error) return;
            recordDataError('blockedSellers', error);
            setBlockedSellers((prev) => prev.filter((item) => item !== phone));
          });
      });
    },
    [requireAuth, blockedSellers, authUid, recordDataError]
  );

  const unblockSeller = useCallback(
    (phone) => {
      setBlockedSellers((prev) => prev.filter((item) => item !== phone));
      supabase
        .from('blocked_sellers')
        .delete()
        .eq('owner_id', authUid)
        .eq('blocked_phone', phone)
        .then(({ error }) => {
          if (!error) return;
          recordDataError('blockedSellers', error);
          setBlockedSellers((prev) => (prev.includes(phone) ? prev : [...prev, phone]));
        });
    },
    [authUid, recordDataError]
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
  const approveListing = useCallback(
    async (listingId) => {
      const previousStatus = listings.find((item) => item.id === listingId)?.status;
      setListings((prev) =>
        prev.map((item) => (item.id === listingId ? { ...item, status: 'approved' } : item))
      );
      const { error } = await supabase.rpc('admin_set_listing_status', {
        p_listing_id: listingId,
        p_status: 'approved',
      });
      if (error) {
        setListings((prev) => prev.map((item) => (item.id === listingId ? { ...item, status: previousStatus } : item)));
        throw error;
      }
    },
    [listings]
  );

  // Marks the listing rejected (visible to the agent, colored red) rather than
  // deleting it outright — admin has a separate deleteListing for outright removal.
  const rejectListing = useCallback(
    async (listingId) => {
      const previousStatus = listings.find((item) => item.id === listingId)?.status;
      setListings((prev) =>
        prev.map((item) => (item.id === listingId ? { ...item, status: 'rejected' } : item))
      );
      const { error } = await supabase.rpc('admin_set_listing_status', {
        p_listing_id: listingId,
        p_status: 'rejected',
      });
      if (error) {
        setListings((prev) => prev.map((item) => (item.id === listingId ? { ...item, status: previousStatus } : item)));
        throw error;
      }
    },
    [listings]
  );

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

  const deleteListing = useCallback(
    async (listingId) => {
      const previousListing = listings.find((item) => item.id === listingId);
      setListings((prev) => prev.filter((item) => item.id !== listingId));
      const { error } = await supabase.from('listings').delete().eq('id', listingId);
      if (error) {
        if (previousListing) setListings((prev) => (prev.some((item) => item.id === listingId) ? prev : [previousListing, ...prev]));
        throw error;
      }
    },
    [listings]
  );

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
    blockedSellers,
    blockSeller,
    unblockSeller,
    agents,
    removeAgent,
    setAgentVerified,
    reports,
    reportListing,
    updateReportStatus,
    deleteReport,
    isAdmin,
    dataLoading,
    dataErrors,
    agentsLoading,
    reportsLoading,
    theme,
    themePreference,
    setTheme: setThemePreference,
    language,
    setLanguage,
    authModalVisible,
    hydrated,
    toggleSave,
    requireAuth,
    closeAuthModal,
    signUp,
    verifySignUpOtp,
    signIn,
    completeMissingProfile,
    sendPasswordResetCode,
    resetPasswordWithOtp,
    updateAccountPassword,
    showOnboarding,
    completeOnboarding,
    replayOnboarding,
    updateProfile,
    changePhoneNumber,
    verifyPhoneChange,
    updateNotificationPrefs,
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
    fetchFavorites,
    fetchAgents,
    fetchBlockedSellers,
    fetchReports,
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
