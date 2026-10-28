import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { SESSION_COOKIE } from "@/server/auth";

export async function GET() {
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.redirect(`${env.appUrl}/login?signed_out=1`);
}
