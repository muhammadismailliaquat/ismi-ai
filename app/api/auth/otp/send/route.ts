import { NextResponse } from "next/server";

/**
 * POST /api/auth/otp/send
 *
 * OTP send is disabled — Google OAuth is the only auth method.
 * Users who reach this endpoint should sign in via Google.
 */
export async function POST(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _: Request
) {
  return NextResponse.json(
    { error: "OTP sending disabled (Google-only auth)" },
    { status: 404 }
  );
}
