// Email sending function for Supabase Edge Runtime
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
  pdfBase64?: string | null;
  pdfFilename?: string | null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { customerEmail, customerName, items, total, pdfBase64, pdfFilename }: OrderPayload = await req.json();

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

    // Prepare optional attachment (Resend API format: filename + content)
    const attachments = [] as Array<{ filename: string; content: string }>;
    if (pdfBase64 && pdfFilename) {
      attachments.push({ filename: pdfFilename, content: pdfBase64 });
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
        to: [ADMIN_EMAIL],
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
