import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getVerificationToken, deleteVerificationToken } from "@/lib/tokens"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")

  if (!token) {
    return NextResponse.redirect(
      new URL("/auth/verify-email?error=missing_token", req.url)
    )
  }

  const record = await getVerificationToken(token)

  if (!record) {
    return NextResponse.redirect(
      new URL("/auth/verify-email?error=invalid_token", req.url)
    )
  }

  const email = record.identifier

  // Case 1: New user registration verification
  const user = await db.user.findFirst({
    where: {
      OR: [
        { email, emailVerified: null },
        { pendingEmail: email },
      ],
    },
  })

  if (!user) {
    await deleteVerificationToken(token)
    return NextResponse.redirect(
      new URL("/auth/verify-email?error=user_not_found", req.url)
    )
  }

  // Case 2: Email change verification (pendingEmail matches)
  if (user.pendingEmail === email) {
    await db.user.update({
      where: { id: user.id },
      data: {
        email,
        emailVerified: new Date(),
        pendingEmail: null,
      },
    })
  } else {
    // Case 1: Registration verification
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    })
  }

  await deleteVerificationToken(token)

  return NextResponse.redirect(
    new URL("/auth/verify-email?success=true", req.url)
  )
}
