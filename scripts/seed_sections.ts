import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");

console.log("📁 Loading .env from:", envPath);

try {
  const envContent = readFileSync(envPath, "utf-8");
  const lines = envContent.split("\n");
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length) {
      const value = valueParts.join("=").trim();
      process.env[key.trim()] = value;
    }
  }
} catch (err) {
  console.error("❌ Error reading .env:", err);
  process.exit(1);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

console.log("🔍 Environment check:");
console.log("VITE_SUPABASE_URL:", supabaseUrl ? "✓ loaded" : "✗ missing");
console.log("SUPABASE_SERVICE_KEY:", supabaseKey ? "✓ loaded" : "✗ missing");

if (!supabaseUrl || !supabaseKey) {
  console.error("\n❌ Chýbajúce env premenné! Skontroluj .env súbor.");
  process.exit(1);
}

const client = createClient(supabaseUrl, supabaseKey);

// ==============================
// TVOJE SEKCIÓNE DÁTA
// ==============================

type SectionData = {
  key: string;
  description: string;
  options: Array<{ name: string; price: number; description?: string }>;
};

const DATA: Record<string, SectionData> = {
  "Priemer torty": {
    key: "diameter",
    description: "spodny popis sekcie",
    options: [
      { name: "15 cm", price: 4 },
      { name: "18 cm", price: 5 },
      { name: "26 cm", price: 6 },
    ],
  },

  "Výška torty": {
    key: "height",
    description: "spodny popis sekcie",
    options: [
      { name: "4 korpusy", price: 5 },
      { name: "6 korpusov", price: 8 },
    ],
  },

  "Vnútorný krém": {
    key: "inner_cream",
    description: "spodny popis sekcie",
    options: [
      { name: "krém z tmavej čokolády", price: 5 },
      { name: "kokosovo-mandľový krém", price: 5 },
      { name: "makový krém", price: 5 },
      { name: "krém z bielej čokolády", price: 5 },
      { name: "cream cheese s bielou čokoládou", price: 5 },
      { name: "karamelový krém", price: 5 },
    ],
  },

  "Obterový krém": {
    key: "outer_cream",
    description: "spodny popis sekcie",
    options: [
      { name: "ganache z bielej čokolády", price: 4 },
      { name: "ganache z tmavej čokolády", price: 4 },
      { name: "mascarpone krém", price: 4 },
    ],
  },

  "Extra zložka": {
    key: "extra",
    description: "spodny popis sekcie",
    options: [
      { name: "karamel", price: 5 },
      { name: "praliné", price: 5 },
    ],
  },

  "Ovocie": {
    key: "fruit",
    description: "spodny popis sekcie",
    options: [
      { name: "lesné ovocie", price: 3 },
      { name: "maliny", price: 3 },
      { name: "mango", price: 3 },
    ],
  },

  "Logistika": {
    key: "logistics",
    description: "spodny popis sekcie",
    options: [
      { name: "krabica", price: 2 },
      { name: "podložka", price: 2 },
    ],
  },
};

// ==============================
// SEED FUNKCIA
// ==============================

async function runSeed() {
  console.log("➡️ Seedovanie databázy začalo...");

  for (const label of Object.keys(DATA)) {
    const item = DATA[label];

    console.log(`➡️ Spracovávam sekciu: ${label}`);

    // 1) vložiť alebo updatnuť section_meta
    const { error: metaErr } = await client
      .from("section_meta")
      .upsert(
        {
          section: item.key,
          description: item.description
        },
        { onConflict: 'section' }
      );

    if (metaErr) {
      console.error(`❌ Chyba pri upsert section_meta pre ${label}:`, metaErr);
      throw metaErr;
    }

    // 2) zmazať staré možnosti
    const { error: delErr } = await client.from("section_options").delete().eq("section", item.key);
    if (delErr) {
      console.error(`❌ Chyba pri delete section_options pre ${label}:`, delErr);
      throw delErr;
    }

    // 3) vložiť nové možnosti
    const rows = item.options.map((opt, idx) => ({
      section: item.key,
      name: opt.name,
      price: opt.price,
      sort_order: idx,
    }));

    const { error: optErr } = await client.from("section_options").insert(rows);
    if (optErr) {
      console.error(`❌ Chyba pri insert section_options pre ${label}:`, optErr);
      throw optErr;
    }

    console.log(`✔️ Hotovo: ${label}`);
  }

  console.log("🎉 Seed hotový bez chýb!");
}

runSeed()
  .then(() => {
    console.log("✅ Proces úspešne dokončený");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seed zlyhal:", err);
    process.exit(1);
  });
