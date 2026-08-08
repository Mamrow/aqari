// Turns a raw JS/Supabase/Dpay error into copy a user should actually see.
// The one rule that matters: never let error.message (a Postgres constraint
// name, a raw HTTP body, a stack-shaped string) reach the screen directly —
// that's what was making failures look like "random code" instead of a
// designed state. Log the real error for debugging; show this instead.
export function friendlyErrorMessage(error, t, extraMap = {}) {
  const message = error?.message ?? '';
  for (const [needle, key] of Object.entries(extraMap)) {
    if (message.includes(needle)) return t(key);
  }
  if (/network|fetch|timeout/i.test(message)) return t('errorNetworkMessage');
  return t('errorGenericMessage');
}
