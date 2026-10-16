// Aqari — tells sellers before and when their listings expire.
//
// A listing is live for 30 days and then lifecycle-cron hides it; 14 days
// after that it's deleted with its photos. Until this existed the only sign
// was a banner in My Listings, which a seller saw only if they happened to
// open that screen in time, so most listings just quietly vanished. This
// sends two pushes per listing, each at most once:
//
//   - "expires in N days", once a live listing is within REMIND_DAYS of
//     its expires_at;
//   - "has expired", once lifecycle-cron has marked it expired.
//
// "At most once" is tracked per expiry date, not per listing:
// expiry_warned_for / expiry_notified_for hold the expires_at value the
// notice was sent for (migration_listing_expiry_reminders.sql). Renewing
// moves expires_at, so the next expiry is due its own notices, and nothing
// has to reset the markers — renew_listing and friends stay untouched.
//
// Called once a day by pg_cron (the same migration schedules it, at 09:00
// UTC = 11:00 in Libya; lifecycle-cron's 03:00 UTC run has already flipped
// that night's expiries by then). It authenticates the way the other
// notify-* functions do, with the shared DB_WEBHOOK_SECRET header rather
// than the service-role key, so the cron job doesn't have to store that key.
// Deploy with --no-verify-jwt: the caller is pg_net, not a signed-in user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REMIND_DAYS = 3;
// How far back an expiry still gets its "has expired" notice. Without a
// limit, the first run would message every listing that ever expired.
const EXPIRED_LOOKBACK_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type ListingRow = {
  id: string;
  title: string | null;
  owner_id: string;
  expires_at: string;
  expiry_warned_for: string | null;
  expiry_notified_for: string | null;
};

type Kind = 'soon' | 'expired';

// Same instant, whatever text form Postgres and PostgREST chose for it.
const sameInstant = (a: string | null, b: string) =>
  a !== null && new Date(a).getTime() === new Date(b).getTime();

const daysLeft = (expiresAt: string) =>
  Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));

function arabicDays(n: number) {
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}

// Both languages in one message, like the other notify-* functions: Expo
// delivers it and knows nothing about the recipient's in-app language.
function message(kind: Kind, rows: ListingRow[]) {
  const quoted = `"${rows[0].title ?? ''}"`;
  if (kind === 'soon') {
    const days = Math.min(...rows.map((row) => daysLeft(row.expires_at)));
    if (rows.length === 1) {
      return {
        title: 'إعلانك ينتهي قريبًا · Listing expiring soon',
        body: `${quoted} — ينتهي خلال ${arabicDays(days)}، جدّده مجانًا / expires in ${days} day${days === 1 ? '' : 's'}. Renew it free.`,
      };
    }
    return {
      title: 'إعلاناتك تنتهي قريبًا · Listings expiring soon',
      body: `${rows.length} من إعلاناتك تنتهي خلال ${arabicDays(days)}، جدّدها مجانًا / ${rows.length} of your listings expire soon. Renew them free.`,
    };
  }
  if (rows.length === 1) {
    return {
      title: 'انتهى إعلانك · Listing expired',
      body: `${quoted} — لم يعد ظاهرًا للمشترين، جدّده مجانًا / is no longer shown to buyers. Renew it free.`,
    };
  }
  return {
    title: 'انتهت بعض إعلاناتك · Listings expired',
    body: `${rows.length} من إعلاناتك لم تعد ظاهرة للمشترين، جدّدها مجانًا / ${rows.length} of your listings are no longer shown. Renew them free.`,
  };
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get('DB_WEBHOOK_SECRET');
  const providedSecret = req.headers.get('X-Webhook-Secret');
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const now = new Date();
  const columns = 'id, title, owner_id, expires_at, expiry_warned_for, expiry_notified_for';

  // Approved only: a pending or rejected listing was never in front of
  // buyers, so "it's about to stop showing" would be news about nothing.
  const [soonResult, expiredResult] = await Promise.all([
    adminClient
      .from('listings')
      .select(columns)
      .eq('status', 'approved')
      .eq('listing_state', 'active')
      .gt('expires_at', now.toISOString())
      .lte('expires_at', new Date(now.getTime() + REMIND_DAYS * DAY_MS).toISOString())
      .range(0, 9999),
    adminClient
      .from('listings')
      .select(columns)
      .eq('status', 'approved')
      .eq('listing_state', 'expired')
      .gt('expires_at', new Date(now.getTime() - EXPIRED_LOOKBACK_DAYS * DAY_MS).toISOString())
      .range(0, 9999),
  ]);
  if (soonResult.error || expiredResult.error) {
    console.error('notify-listing-expiry: read failed', soonResult.error, expiredResult.error);
    return new Response(JSON.stringify({ error: 'Read failed' }), { status: 500 });
  }

  const due: { kind: Kind; row: ListingRow }[] = [
    ...((soonResult.data ?? []) as ListingRow[])
      .filter((row) => !sameInstant(row.expiry_warned_for, row.expires_at))
      .map((row) => ({ kind: 'soon' as const, row })),
    ...((expiredResult.data ?? []) as ListingRow[])
      .filter((row) => !sameInstant(row.expiry_notified_for, row.expires_at))
      .map((row) => ({ kind: 'expired' as const, row })),
  ];
  if (due.length === 0) {
    return new Response(JSON.stringify({ soon: 0, expired: 0 }), { status: 200 });
  }

  const ownerIds = [...new Set(due.map(({ row }) => row.owner_id))];
  const { data: profiles, error: profileError } = await adminClient
    .from('profiles')
    .select('auth_uid, push_token')
    .in('auth_uid', ownerIds);
  if (profileError) {
    console.error('notify-listing-expiry: token read failed', profileError);
    return new Response(JSON.stringify({ error: 'Read failed' }), { status: 500 });
  }
  const tokenByOwner = new Map(
    (profiles ?? [])
      .filter((profile) => profile.push_token)
      .map((profile) => [profile.auth_uid as string, profile.push_token as string])
  );

  // One push per seller per kind, so three listings expiring together are
  // one notification, not three.
  const groups = new Map<string, { kind: Kind; owner: string; rows: ListingRow[] }>();
  for (const { kind, row } of due) {
    const key = `${kind}:${row.owner_id}`;
    const group = groups.get(key) ?? { kind, owner: row.owner_id, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const outgoing = [...groups.values()].filter((group) => tokenByOwner.has(group.owner));
  const messages = outgoing.map((group) => ({
    to: tokenByOwner.get(group.owner),
    ...message(group.kind, group.rows),
    // listingId keeps older app builds working (they open that listing);
    // `open` sends newer ones to My Listings, where the Renew button is.
    data: { listingId: group.rows[0].id, open: 'myListings' },
  }));

  // Expo takes up to 100 messages per request. A batch that fails stays
  // unmarked below, so tomorrow's run tries it again.
  const failedOwners = new Set<string>();
  for (let index = 0; index < messages.length; index += 100) {
    const batch = messages.slice(index, index + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    }).catch((error) => {
      console.error('notify-listing-expiry: push send threw', error);
      return null;
    });
    if (!res?.ok) {
      if (res) console.error('notify-listing-expiry: push send failed', await res.text());
      outgoing.slice(index, index + 100).forEach((group) => failedOwners.add(`${group.kind}:${group.owner}`));
    }
  }

  // Mark everything that was due, including sellers with no push token:
  // there's nothing to retry for them, and re-reading them daily is waste.
  let marked = 0;
  for (const group of groups.values()) {
    if (failedOwners.has(`${group.kind}:${group.owner}`)) continue;
    const column = group.kind === 'soon' ? 'expiry_warned_for' : 'expiry_notified_for';
    for (const row of group.rows) {
      const { error } = await adminClient
        .from('listings')
        .update({ [column]: row.expires_at })
        .eq('id', row.id);
      if (error) console.error('notify-listing-expiry: mark failed', row.id, error);
      else marked += 1;
    }
  }

  return new Response(
    JSON.stringify({
      soon: due.filter((item) => item.kind === 'soon').length,
      expired: due.filter((item) => item.kind === 'expired').length,
      pushes: messages.length,
      failedPushes: failedOwners.size,
      marked,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
