// Deletes the calling account's own Supabase Auth user — and, via the FK
// cascades in schema.sql (profiles/favorites/agents ON DELETE CASCADE,
// listings.owner_id ON DELETE SET NULL), everything that hangs off it.
//
// This can't be done from the mobile app directly: deleting an auth.users
// row requires the service_role key, which must never ship in the client
// bundle (it bypasses every RLS policy in the project). This function is the
// one place that key is allowed to live — it never leaves the server, and
// the function only ever deletes the SAME account whose JWT called it, never
// an id supplied by the client.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401 });
  }

  // Identifies the caller from their own JWT — proves who's asking, rather
  // than trusting any id the client might send in the request body.
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
