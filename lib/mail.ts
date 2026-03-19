import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.qq.com",
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@example.com"

export async function sendVerificationEmail(email: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`

  await transporter.sendMail({
    from: `"IFC Platform" <${FROM}>`,
    to: email,
    subject: "Verify your email - IFC Platform",
    html: `
      <div style="max-width:480px;margin:0 auto;font-family:sans-serif;padding:24px;">
        <h2 style="color:#111;">Verify your email address</h2>
        <p style="color:#555;line-height:1.6;">
          Click the button below to verify your email address. This link will expire in 24 hours.
        </p>
        <a href="${verifyUrl}"
           style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:8px;margin:16px 0;">
          Verify Email
        </a>
        <p style="color:#999;font-size:13px;margin-top:24px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  })
}
