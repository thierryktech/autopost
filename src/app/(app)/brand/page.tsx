import { getDb } from "@/server/db/connect";
import { brandKit } from "@/server/db/schema";
import { BrandForm } from "./brand-form";

export const metadata = { title: "Brand Kit" };

export default async function BrandPage() {
  const db = await getDb();
  const [kit] = await db.select().from(brandKit).limit(1);
  const { updatedAt, id, ...rest } = kit;
  void id;
  return <BrandForm initial={rest} updatedAt={updatedAt.toISOString()} />;
}
