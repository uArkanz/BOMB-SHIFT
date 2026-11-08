// supabase/functions/_shared/cors.ts
// Shared CORS headers for all BOMB//SHIFT Edge Functions.
// Allow requests from any origin during development; tighten to the
// production domain before final release.

export const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
