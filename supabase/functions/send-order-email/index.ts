// Email sending function for Supabase Edge Runtime
import { createClient } from "@supabase/supabase-js";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = "janspano01@gmail.com"; // fallback email
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

// Escape HTML special chars to prevent XSS/HTML injection in email body
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Sanitize filename: strip path separators and non-safe characters
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\- ]/g, '').slice(0, 100) || 'attachment.pdf';
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MB base64 limit

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { customerEmail, customerName, items, total, pdfBase64, pdfFilename, bakeryId }: OrderPayload = body;

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }

    // --- Input validation ---
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

    // Resolve bakery owner's email using service role client
    let adminEmail = ADMIN_EMAIL;
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
          if (user?.email) adminEmail = user.email;
        }
      } catch (_err) {
        // keep fallback
      }
    }

    // Vytvor HTML obsah pre email — všetky user inputs sú escapované (XSS prevencia)
    const itemsHtml = items
      .map(
        (item) =>
          `<tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(String(item.name))}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${escapeHtml(String(item.qty))}x</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${Number(item.unitPrice).toFixed(2)} €</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${Number(item.lineTotal).toFixed(2)} €</td>
          </tr>`
      )
      .join("");

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Nová objednávka</h2>
        <p><strong>Meno:</strong> ${escapeHtml(customerName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(customerEmail)}</p>
        <h3>Položky objednávky:</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Položka</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Počet</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Cena/ks</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Spolu</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <p style="font-size: 18px; font-weight: bold; text-align: right;">Celková suma: ${total.toFixed(2)} €</p>
      </div>
    `;

    // Prepare optional attachment (Resend API format: filename + content)
    const attachments = [] as Array<{ filename: string; content: string }>;
    if (pdfBase64 && pdfFilename) {
      attachments.push({ filename: sanitizeFilename(pdfFilename), content: pdfBase64 });
    }

    // Poslať email adminovi (promise, nech beží paralelne)
    const adminEmailResponse = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Objednávky <onboarding@resend.dev>",
        to: [adminEmail],
        subject: `Nová objednávka od ${customerName}`,
        html: emailHtml,
        attachments: attachments.length ? attachments : undefined,
      }),
    });

    // Pošli admin aj customer email paralelne; admin chyba je blokujúca, customer je "best effort"
    const adminPromise = (async () => {
      const resp = await adminEmailResponse;
      const body = await resp.json();
      if (!resp.ok || body?.error) {
        throw new Error(body?.error || `Admin email failed with status: ${resp.status}`);
      }
      return body;
    })();

    const customerPromise = (async () => {
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Torty <onboarding@resend.dev>",
            to: [customerEmail],
            subject: "Potvrdenie objednávky",
            html: `
              <div style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">
                <h2>Ďakujeme za objednávku!</h2>
                <p>Dobrý deň ${customerName},</p>
                <p>Vaša objednávka bola úspešne prijatá. Čoskoro Vás budeme kontaktovať.</p>
                ${emailHtml}
                <p>S pozdravom,<br>Váš tím</p>
              </div>
            `,
            attachments: attachments.length ? attachments : undefined,
          }),
        });
        const body = await resp.json();
        if (!resp.ok || body?.error) {
          throw new Error(body?.error || `Customer email failed with status: ${resp.status}`);
        }
        return body;
      } catch (err) {
        return err instanceof Error ? err : new Error(String(err));
      }
    })();

    const [adminResult, customerResult] = await Promise.all([adminPromise, customerPromise]);
    const customerError = customerResult instanceof Error ? customerResult.message : null;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: customerError ? "Admin email sent; customer email may have failed" : "Emails sent successfully",
        adminId: adminResult.id,
        customerId: customerResult instanceof Error ? null : customerResult?.id || null,
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
