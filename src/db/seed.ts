import { sql } from "drizzle-orm";
import type { DB } from "./index";
import { products } from "./schema";

export const SEED_PRODUCTS = [
  { slug: "arabika-gayo-250g", name: "Arabika Gayo 250 g", category: "Coffee", priceIdr: 95_000, stock: 24, emoji: "☕", description: "Single-origin Aceh Gayo, washed process. Notes of dark chocolate, citrus and brown sugar. Medium roast, whole bean." },
  { slug: "arabika-toraja-250g", name: "Arabika Toraja 250 g", category: "Coffee", priceIdr: 105_000, stock: 18, emoji: "☕", description: "Sulawesi highland coffee with a heavy body, low acidity and a spiced, earthy finish." },
  { slug: "robusta-temanggung-500g", name: "Robusta Temanggung 500 g", category: "Coffee", priceIdr: 78_000, stock: 30, emoji: "🫘", description: "Bold, nutty robusta from Central Java. Great for kopi tubruk or milk-based drinks." },
  { slug: "kopi-susu-literan", name: "Kopi Susu Gula Aren 1 L", category: "Coffee", priceIdr: 65_000, stock: 12, emoji: "🥛", description: "Ready-to-drink iced coffee with fresh milk and palm sugar. Keep refrigerated, best within 3 days." },
  { slug: "teh-melati-100g", name: "Teh Melati 100 g", category: "Tea", priceIdr: 32_000, stock: 40, emoji: "🍵", description: "Classic Javanese jasmine tea, loose leaf. Fragrant and smooth, hot or iced." },
  { slug: "teh-hijau-sencha-50g", name: "Green Tea Sencha 50 g", category: "Tea", priceIdr: 48_000, stock: 20, emoji: "🍃", description: "Grown in West Java highlands, steamed in the Japanese style. Grassy and sweet." },
  { slug: "wedang-jahe-sachet", name: "Wedang Jahe (10 sachets)", category: "Tea", priceIdr: 28_000, stock: 50, emoji: "🫚", description: "Instant ginger drink with lemongrass and palm sugar. Warming on rainy evenings." },
  { slug: "keripik-tempe", name: "Keripik Tempe Pedas", category: "Snacks", priceIdr: 22_000, stock: 35, emoji: "🌶️", description: "Thin, crunchy tempeh chips with chilli and lime leaf. 150 g pouch." },
  { slug: "kue-lapis-legit", name: "Lapis Legit Mini", category: "Snacks", priceIdr: 85_000, stock: 6, emoji: "🍰", description: "Eighteen-layer spiced butter cake, baked in small batches. 10 × 10 cm." },
  { slug: "pisang-sale", name: "Pisang Sale", category: "Snacks", priceIdr: 25_000, stock: 28, emoji: "🍌", description: "Sun-dried sweet banana, chewy and naturally sweet. No added sugar." },
  { slug: "tumbler-500ml", name: "Insulated Tumbler 500 ml", category: "Merch", priceIdr: 149_000, stock: 10, emoji: "🧉", description: "Double-wall stainless steel tumbler. Keeps drinks cold for 12 h or hot for 6 h." },
  { slug: "v60-dripper", name: "Ceramic V60 Dripper", category: "Merch", priceIdr: 175_000, stock: 3, emoji: "🫖", description: "Size 02 ceramic pour-over dripper. Pair with our Gayo beans." },
];

export async function seedIfEmpty(db: DB): Promise<void> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(products);
  if (n === 0) await db.insert(products).values(SEED_PRODUCTS);
}
