// Deletes the authenticated caller's account and everything it published:
// avatar and listing media in Storage, the caller's listings, then auth.users.
// The service-role key stays server-side.
//
// The listings have to be deleted here, explicitly. schema.sql's
// listings.owner_id FK is `on delete set null`, so deleting the auth user alone
// would leave every approved listing on the map — with its photos already
// removed below and no seller to contact — until it expired. Deleting the rows
// cascades to other users' favorites and to reports on them; boost payment
// records keep their row with listing_id set to NULL.
//
// profiles, agents, blocked_sellers and the caller's own favorites/reports
// cascade from the auth.users delete at the end.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BUCKET = 'listing-photos';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function objectPathFromPublicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;

  try {
    const url = new URL(value);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;

    const encodedPath = url.pathname.slice(markerIndex + marker.length);
    const path = decodeURIComponent(encodedPath).replace(/^\/+/, '');
    if (!path || path.includes('..')) return null;
    return path;
  } catch {
    return null;
  }
}

function uniquePaths(values: unknown[]): string[] {
  return [...new Set(values.map(objectPathFromPublicUrl).filter((path): path is string => Boolean(path)))];
}

async function removeInChunks(storage: ReturnType<typeof createClient>['storage'], paths: string[]) {
  // Keep batches small and deterministic. The Deno Supabase client accepts an
  // array of object paths for one remove call, but a user may have many uploads.
  for (let index = 0; index < paths.length; index += 100) {
    const batch = paths.slice(index, index + 100);
    const { error } = await storage.from(BUCKET).remove(batch);
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing authorization' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('delete-account is missing required Supabase environment variables');
    return json({ error: 'Server configuration error' }, 500);
  }

  // Resolve the caller from their JWT. Never accept a user ID from the request
  // body, because account deletion must only affect the authenticated caller.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Invalid session' }, 401);

  const userId = userData.user.id;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const [{ data: profile, error: profileError }, { data: listings, error: listingsError }] = await Promise.all([
    adminClient.from('profiles').select('avatar_url').eq('auth_uid', userId).maybeSingle(),
    adminClient.from('listings').select('images').eq('owner_id', userId),
  ]);

  if (profileError || listingsError) {
    console.error('delete-account data lookup failed', { profileError, listingsError });
    return json({ error: 'Could not prepare account deletion' }, 500);
  }

  const mediaUrls = [
    profile?.avatar_url,
    ...(listings ?? []).flatMap((listing) => (Array.isArray(listing.images) ? listing.images : [])),
  ];
  const mediaPaths = uniquePaths(mediaUrls);

  // Clean up Storage first. If cleanup fails, leave the auth account intact so
  // the user can retry instead of silently leaving known personal media behind.
  try {
    await removeInChunks(adminClient.storage, mediaPaths);
  } catch (storageError) {
    console.error('delete-account storage cleanup failed', storageError);
    return json({ error: 'Could not remove account files. Please try again.' }, 500);
  }

  // Delete the caller's listings while owner_id still identifies them — after
  // deleteUser() below, the FK sets owner_id to NULL and there'd be no way to
  // find these rows again. If this fails, stop before touching the auth
  // account so a retry can finish the job.
  const { error: listingsDeleteError } = await adminClient
    .from('listings')
    .delete()
    .eq('owner_id', userId);
  if (listingsDeleteError) {
    console.error('delete-account listing deletion failed', listingsDeleteError);
    return json({ error: 'Could not delete your listings. Please try again.' }, 500);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('delete-account auth deletion failed', deleteError);
    return json({ error: 'Could not delete the account. Please try again.' }, 500);
  }

  return json({ success: true });
});
