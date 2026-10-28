import { desc } from "drizzle-orm";
import { getDb } from "@/server/db/connect";
import { products } from "@/server/db/schema";
import { ProductsView } from "./products-view";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const db = await getDb();
  const rows = await db.select().from(products).orderBy(desc(products.updatedAt));
  return <ProductsView products={rows.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }))} />;
}
