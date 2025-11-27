// Setup type definitions for built-in Supabase Runtime APIs
/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = "janspano01@gmail.com"; // Zmeň na tvoj admin email

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
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { customerEmail, customerName, items, total }: OrderPayload = await req.json();

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }

    // Vytvor HTML obsah pre email
    const itemsHtml = items
      .map(
        (item) =>
          `<tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${item.name}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.qty}x</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item.unitPrice.toFixed(2)} €</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item.lineTotal.toFixed(2)} €</td>
          </tr>`
      )
      .join("");

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Nová objednávka</h2>
        <p><strong>Meno:</strong> ${customerName}</p>
        <p><strong>Email:</strong> ${customerEmail}</p>
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

    // Poslať email adminovi
    const adminEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Objednávky <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `Nová objednávka od ${customerName}`,
        html: emailHtml,
      }),
    });

    const adminResult = await adminEmailResponse.json();
    console.log("Admin email response:", adminResult);

    // Poslať potvrdenie zákazníkovi
    const customerEmailResponse = await fetch("https://api.resend.com/emails", {
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
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Ďakujeme za objednávku!</h2>
            <p>Dobrý deň ${customerName},</p>
            <p>Vaša objednávka bola úspešne prijatá. Čoskoro Vás budeme kontaktovať.</p>
            ${emailHtml}
            <p>S pozdravom,<br>Váš tím</p>
          </div>
        `,
      }),
    });

    const customerResult = await customerEmailResponse.json();
    console.log("Customer email response:", customerResult);

    // Kontrola, či Resend vrátil error (nie HTTP status, ale v JSON)
    if (adminResult.error || customerResult.error) {
      const errorMsg = `Email errors: Admin: ${adminResult.error || 'OK'}, Customer: ${customerResult.error || 'OK'}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Emails sent successfully",
        adminId: adminResult.id,
        customerId: customerResult.id
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
