// register-bakery — creates bakery + bakery_member using service role (bypasses RLS)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { bakeryName, slug, email, userId } = await req.json();

    if (!bakeryName || !slug || !userId) {
      return new Response(
        JSON.stringify({ error: "Chýbajú povinné polia: bakeryName, slug, userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || slug.length < 2) {
      return new Response(
        JSON.stringify({ error: "Neplatný slug." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check slug uniqueness
    const { data: existing } = await admin
      .from("bakeries")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Tento odkaz (slug) je už obsadený. Zvoľte iný." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert bakery
    const { data: bakery, error: bakeryError } = await admin
      .from("bakeries")
      .insert({ name: bakeryName, slug, email: email ?? null })
      .select("id")
      .single();

    if (bakeryError) {
      return new Response(
        JSON.stringify({ error: bakeryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert bakery_member
    const { error: memberError } = await admin
      .from("bakery_members")
      .insert({ bakery_id: bakery.id, user_id: userId, role: "owner" });

    if (memberError) {
      // Rollback bakery insert
      await admin.from("bakeries").delete().eq("id", bakery.id);
      return new Response(
        JSON.stringify({ error: memberError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, bakeryId: bakery.id, slug }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
