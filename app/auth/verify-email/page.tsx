"use client"

import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, Building2 } from "lucide-react"

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const success = searchParams.get("success")
  const error = searchParams.get("error")

  const errorMessages: Record<string, string> = {
    missing_token: "Verification link is invalid.",
    invalid_token: "This link has expired or is no longer valid.",
    user_not_found: "No matching account found for this verification.",
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Email Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {success && (
            <>
              <div className="flex flex-col items-center gap-3">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p className="text-lg font-medium">Email verified!</p>
                <p className="text-sm text-muted-foreground">
                  Your email address has been successfully verified.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Link href="/dashboard">
                  <Button className="w-full">Go to Dashboard</Button>
                </Link>
                <Link href="/auth/signin">
                  <Button variant="outline" className="w-full">
                    Sign in
                  </Button>
                </Link>
              </div>
            </>
          )}

          {error && (
            <>
              <div className="flex flex-col items-center gap-3">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="text-lg font-medium">Verification failed</p>
                <p className="text-sm text-muted-foreground">
                  {errorMessages[error] || "Something went wrong."}
                </p>
              </div>
              <Link href="/auth/signin">
                <Button variant="outline" className="w-full">
                  Back to sign in
                </Button>
              </Link>
            </>
          )}

          {!success && !error && (
            <p className="text-muted-foreground">
              Check your email for a verification link.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
