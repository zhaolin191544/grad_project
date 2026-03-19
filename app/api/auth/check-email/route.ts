import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

export async function POST(req: Request) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ status: "invalid" })
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { password: true, emailVerified: true },
  })

  if (!user || !user.password) {
    return NextResponse.json({ status: "invalid" })
  }

  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) {
    return NextResponse.json({ status: "invalid" })
  }

  if (!user.emailVerified) {
    return NextResponse.json({ status: "unverified" })
  }

  return NextResponse.json({ status: "ok" })
}
