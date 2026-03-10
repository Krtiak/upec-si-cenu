// Email sending function for Supabase Edge Runtime — using Brevo (formerly Sendinblue)
import { createClient } from "@supabase/supabase-js";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const ADMIN_EMAIL = "janspano01@gmail.com"; // fallback email
const SENDER_EMAIL = "janspano01@gmail.com"; // overený sender v Brevo
const SENDER_NAME = "Upec si cenu";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderItem {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface OrderPayload {
  customerEmail: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  pdfBase64?: string | null;
  pdfFilename?: string | null;
  bakeryId?: string | null;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\- ]/g, '').slice(0, 100) || 'attachment.pdf';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

async function sendBrevoEmail(opts: {
  to: string;
  toName: string;
  subject: string;
  html: string;
  attachment?: { name: string; content: string } | null;
}) {
  const body: Record<string, unknown> = {
    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
    to: [{ email: opts.to, name: opts.toName }],
    subject: opts.subject,
    htmlContent: opts.html,
  };
  if (opts.attachment) {
    body.attachment = [{ name: opts.attachment.name, content: opts.attachment.content }];
  }
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY!,
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.message || `Brevo error: ${resp.status}`);
  }
  return json;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { customerEmail, customerName, items, total, pdfBase64, pdfFilename, bakeryId }: OrderPayload = body;

    if (!BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY is not set");
    }

    if (!EMAIL_REGEX.test(customerEmail ?? '')) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid customer email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }
    if (typeof customerName !== 'string' || customerName.trim().length === 0 || customerName.length > 200) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid customer name' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid items' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }
    if (typeof total !== 'number' || !isFinite(total) || total < 0) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid total' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }
    if (pdfBase64 && pdfBase64.length > MAX_PDF_BYTES) {
      return new Response(JSON.stringify({ success: false, error: 'PDF too large' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    let bakeryEmail = ADMIN_EMAIL;
    let bakeryName = "Cukraren";
    if (bakeryId) {
      try {
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: members } = await supabaseAdmin
          .from("bakery_members")
          .select("user_id")
          .eq("bakery_id", bakeryId)
          .limit(1)
          .single();
        if (members?.user_id) {
          const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(members.user_id);
          if (user?.email) bakeryEmail = user.email;
        }
        const { data: bak } = await supabaseAdmin
          .from("bakeries")
          .select("name")
          .eq("id", bakeryId)
          .single();
        if (bak?.name) bakeryName = bak.name;
      } catch (_err) {
        // keep fallback
      }
    }

    const itemsHtml = items
      .map((item) =>
        `<tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(String(item.name))}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${escapeHtml(String(item.qty))}x</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${Number(item.unitPrice).toFixed(2)} EUR</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${Number(item.lineTotal).toFixed(2)} EUR</td>
        </tr>`
      )
      .join("");

    const orderTable = `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Polozka</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Pocet</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Cena/ks</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Spolu</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <p style="font-size: 18px; font-weight: bold; text-align: right;">Celkova suma: ${total.toFixed(2)} EUR</p>
    `;

    const bakeryHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Nova objednavka od ${escapeHtml(customerName)}</h2>
        <p><strong>Meno:</strong> ${escapeHtml(customerName)}</p>
        <p><strong>Email zakaznika:</strong> ${escapeHtml(customerEmail)}</p>
        <h3>Polozky objednavky:</h3>
        ${orderTable}
      </div>
    `;

    const customerHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Dakujeme za objednavku!</h2>
        <p>Dobry den ${escapeHtml(customerName)},</p>
        <p>Vasa objednavka v <strong>${escapeHtml(bakeryName)}</strong> bola uspesne prijata. Coskoro Vas budeme kontaktovat.</p>
        <h3>Vasa objednavka:</h3>
        ${orderTable}
        <p>S pozdravom,<br>${escapeHtml(bakeryName)}</p>
      </div>
    `;

    const attachment = pdfBase64 && pdfFilename
      ? { name: sanitizeFilename(pdfFilename), content: pdfBase64 }
      : null;

    const [bakeryResult, customerResult] = await Promise.allSettled([
      sendBrevoEmail({ to: bakeryEmail, toName: bakeryName, subject: `Nova objednavka od ${customerName}`, html: bakeryHtml, attachment }),
      sendBrevoEmail({ to: customerEmail, toName: customerName, subject: `Potvrdenie objednavky - ${bakeryName}`, html: customerHtml, attachment }),
    ]);

    if (bakeryResult.status === 'rejected') {
      throw new Error(`Bakery email failed: ${bakeryResult.reason}`);
    }

    const customerError = customerResult.status === 'rejected' ? String(customerResult.reason) : null;

    return new Response(
      JSON.stringify({
        success: true,
        message: customerError ? "Bakery email sent; customer email may have failed" : "Emails sent successfully",
        customerError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error sending emails:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
