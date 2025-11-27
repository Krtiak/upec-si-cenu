# Supabase Edge Function Setup - Email Notifikácie

## 📋 Prehľad

Edge Function `send-order-email` odosiela automatické emaily adminovi a zákazníkovi po vytvorení objednávky.

## 🚀 Deployment Kroky

### 1. Získaj Resend API Key

1. Choď na [resend.com](https://resend.com)
2. Vytvor účet (free tier — 100 emailov/deň)
3. Dashboard → API Keys → Create API Key
4. Skopíruj kľúč (začína `re_`)

### 2. Prihlásiť sa do Supabase CLI

```pwsh
cd 'c:\Users\janik\Desktop\vscode\upec si cenu'
npx supabase login
```

Otvorí sa prehliadač pre autorizáciu.

### 3. Prepojiť projekt

```pwsh
npx supabase link --project-ref qutvqtonfapxfkgizbdn
```

Zadaj database password (zo Supabase Dashboard → Settings → Database).

### 4. Nastaviť Resend API Key ako secret

```pwsh
npx supabase secrets set RESEND_API_KEY=tvoj_resend_api_key_tu
```

### 5. Upraviť admin email

Otvor `supabase\functions\send-order-email\index.ts` a zmeň:

```typescript
const ADMIN_EMAIL = "admin@example.com"; // Zmeň na tvoj admin email
```

### 6. Deploy funkciu

```pwsh
npx supabase functions deploy send-order-email
```

### 7. Otestovať funkciu

V Supabase Dashboard → Edge Functions → `send-order-email` → Invoke:

```json
{
  "customerEmail": "test@example.com",
  "customerName": "Test User",
  "items": [
    {
      "name": "Torta #1",
      "qty": 2,
      "unitPrice": 35.00,
      "lineTotal": 70.00
    }
  ],
  "total": 70.00
}
```

Skontroluj, či emaily prišli na admin aj zákaznícky email.

## ⚙️ Konfigurácia Resend Domény (Voliteľné)

Pre posielanie emailov z vlastnej domény:

1. Resend Dashboard → Domains → Add Domain
2. Pridaj DNS záznamy (MX, TXT)
3. V `index.ts` zmeň:
   ```typescript
   from: "Objednávky <objednavky@tvojadomena.sk>"
   ```

## 🔧 Lokálne Testovanie (Voliteľné)

```pwsh
npx supabase start
npx supabase functions serve send-order-email --env-file ./supabase/.env.local
```

V `.env.local`:
```
RESEND_API_KEY=re_tvoj_kľúč
```

Test curl:
```pwsh
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-order-email' `
  --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' `
  --header 'Content-Type: application/json' `
  --data '{\"customerEmail\":\"test@test.sk\",\"customerName\":\"Test\",\"items\":[{\"name\":\"Torta #1\",\"qty\":1,\"unitPrice\":35,\"lineTotal\":35}],\"total\":35}'
```

## 📊 Monitorovanie

- **Supabase Dashboard** → Edge Functions → Logs
- **Resend Dashboard** → Logs (sledovanie emailov)

## ⚠️ Poznámky

- Free tier Resend: 100 emailov/deň, 3000/mesiac
- Pre produkciu zvážiť upgrade alebo vlastnú doménu
- Edge Function beží na Deno runtime (nie Node.js)

## 🎯 Ďalšie kroky

- [ ] Nastaviť vlastnú Resend doménu
- [ ] Pridať HTML šablóny pre emaily
- [ ] Nastaviť admin notifikácie (Slack/Discord webhook)
- [ ] Vytvoriť AdminPanel pre prezeranie objednávok
