import { getAddress, isAddress, zeroAddress } from "viem";
import { NextResponse } from "next/server";
import { projectConfig } from "@/config/project.config";
import { referralAttributionCookieName } from "@/lib/referrals";

export async function GET(request: Request, context: { params: Promise<{ referrer: string }> }) {
  const { referrer } = await context.params;
  if (!isAddress(referrer) || referrer.toLowerCase() === zeroAddress) {
    return new NextResponse("Invalid referral address.", { status: 400 });
  }
  const response = NextResponse.redirect(new URL("/", request.url), 307);
  response.cookies.set(referralAttributionCookieName, getAddress(referrer), {
    maxAge: projectConfig.referrals.attributionDays * 86_400,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
