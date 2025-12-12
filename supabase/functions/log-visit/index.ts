import { createClient } from "@supabase/supabase-js"; // tu je OK



const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing Supabase edge function secrets.");
}

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false }
});

interface VisitPayload { path?: string }

// Geolocation function using ip-api.com
async function getLocationFromIP(ip: string): Promise<{ city?: string; country?: string } | null> {
  try {
    // Skip private IPs
    if (ip === 'localhost' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return null;
    }
    
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=city,country`, {
      method: 'GET',
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        city: data.city || undefined,
        country: data.country || undefined,
      };
    }
    
    return null;
  } catch (err) {
    console.error('Geolocation error:', err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { path }: VisitPayload = await req.json().catch(() => ({ path: '/' }));
    const visitPath = (typeof path === 'string' && path.length <= 200 ? path : '/').trim() || '/';

    const ipRaw = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const ip = ipRaw.split(',')[0].trim();
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Get geolocation data
    const location = await getLocationFromIP(ip);

    // Optional anonymization: hash IP instead of storing raw
    // const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    // const ipHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const { error } = await supabase.from('page_visits').insert({
      path: visitPath,
      ip, // replace with ipHash if anonymizing
      user_agent: userAgent,
      city: location?.city || null,
      country: location?.country || null,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

// Usage (frontend): POST https://<project-ref>.functions.supabase.co/log-visit { path: '/' }
// Secrets required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
