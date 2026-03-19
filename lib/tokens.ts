import crypto from "crypto"
import { db } from "@/lib/db"

export async function generateVerificationToken(identifier: string) {
  const token = crypto.randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  // Delete any existing tokens for this identifier
  await db.verificationToken.deleteMany({
    where: { identifier },
  })

  const verificationToken = await db.verificationToken.create({
    data: {
      identifier,
      token,
      expires,
    },
  })

  return verificationToken
}

export async function getVerificationToken(token: string) {
  const record = await db.verificationToken.findUnique({
    where: { token },
  })

  if (!record) return null
  if (record.expires < new Date()) {
    await db.verificationToken.delete({ where: { token } })
    return null
  }

  return record
}

export async function deleteVerificationToken(token: string) {
  await db.verificationToken.delete({ where: { token } })
}
