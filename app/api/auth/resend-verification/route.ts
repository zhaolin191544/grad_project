import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { generateVerificationToken } from "@/lib/tokens"
import { sendVerificationEmail } from "@/lib/mail"

export async function POST(req: Request) {
  try {
    const { email } = await req.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { email },
    })

    if (!user) {
      // Don't reveal whether the user exists
      return NextResponse.json({ message: "If the account exists, a verification email has been sent." })
    }

    if (user.emailVerified) {
      return NextResponse.json({ message: "Email is already verified." })
    }

    const verificationToken = await generateVerificationToken(email)
    await sendVerificationEmail(email, verificationToken.token)

    return NextResponse.json({
      message: "Verification email sent. Please check your inbox.",
    })
  } catch (error) {
    console.error("[RESEND_VERIFICATION_ERROR]", error)
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 }
    )
  }
}
