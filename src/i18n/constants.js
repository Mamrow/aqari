// Shared with App.js, which reads this key before AppProvider mounts to set
// I18nManager.forceRTL prior to first render.
export const LANGUAGE_STORAGE_KEY = 'lang';

// Deliberately its own AsyncStorage key rather than a field in the app-state
// blob (@aqari/app_state): that blob gets discarded wholesale on a schema
// version bump, which would make onboarding reappear for existing users
// every time an unrelated persisted field changes shape. Shared with
// SettingsScreen, which clears it to replay onboarding on demand.
export const ONBOARDING_SEEN_KEY = '@aqari/onboarding_seen';
