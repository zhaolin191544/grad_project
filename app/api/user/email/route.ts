import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateVerificationToken } from "@/lib/tokens"
import { sendVerificationEmail } from "@/lib/mail"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { email } = await req.json()

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 })
  }

  const normalizedEmail = email.trim().toLowerCase()

  // Check if same as current
  const currentUser = await db.user.findUnique({
    where: { id: session.user.id },
  })

  if (currentUser?.email === normalizedEmail) {
    return NextResponse.json(
      { error: "This is already your current email" },
      { status: 400 }
    )
  }

  // Check if email is taken
  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
  })

  if (existing) {
    return NextResponse.json(
      { error: "This email is already in use" },
      { status: 409 }
    )
  }

  // Save pending email
  await db.user.update({
    where: { id: session.user.id },
    data: { pendingEmail: normalizedEmail },
  })

  // Generate token and send verification email
  const verificationToken = await generateVerificationToken(normalizedEmail)
  await sendVerificationEmail(normalizedEmail, verificationToken.token)

  return NextResponse.json({
    message: "Verification email sent. Please check your inbox.",
  })
}
