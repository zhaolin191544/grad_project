"use client"

import { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Camera,
  Check,
  Loader2,
  Mail,
  AlertCircle,
  CheckCircle,
} from "lucide-react"

interface UserProfile {
  id: string
  name: string | null
  email: string
  emailVerified: string | null
  pendingEmail: string | null
  image: string | null
}

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [loading, setLoading] = useState(true)

  const [savingName, setSavingName] = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)

  const [savingEmail, setSavingEmail] = useState(false)
  const [emailMessage, setEmailMessage] = useState("")
  const [emailError, setEmailError] = useState("")

  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    try {
      const res = await fetch("/api/user/profile")
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        setName(data.name || "")
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    setSavingName(true)
    setNameSuccess(false)

    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })

      if (res.ok) {
        const data = await res.json()
        setProfile((prev) => (prev ? { ...prev, name: data.name } : prev))
        setNameSuccess(true)
        await updateSession({ name: data.name })
        setTimeout(() => setNameSuccess(false), 3000)
      }
    } finally {
      setSavingName(false)
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault()
    setSavingEmail(true)
    setEmailMessage("")
    setEmailError("")

    try {
      const res = await fetch("/api/user/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      })

      const data = await res.json()

      if (res.ok) {
        setEmailMessage(data.message)
        setNewEmail("")
        setProfile((prev) =>
          prev ? { ...prev, pendingEmail: newEmail } : prev
        )
      } else {
        setEmailError(data.error)
      }
    } finally {
      setSavingEmail(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    const formData = new FormData()
    formData.append("avatar", file)

    try {
      const res = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        setProfile((prev) => (prev ? { ...prev, image: data.image } : prev))
        await updateSession({ image: data.image })
      }
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      {/* Avatar */}
      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
          <CardDescription>
            Click to upload a new profile picture
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile?.image || ""} />
                <AvatarFallback className="text-2xl">
                  {profile?.name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity hover:opacity-100"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Upload a JPEG, PNG, WebP, or GIF image.</p>
              <p>Max file size: 5MB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Name */}
      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
          <CardDescription>Your display name</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveName} className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="name" className="sr-only">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <Button type="submit" disabled={savingName}>
              {savingName ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : nameSuccess ? (
                <Check className="mr-2 h-4 w-4" />
              ) : null}
              {nameSuccess ? "Saved" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Manage your email address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{profile?.email}</p>
                <p className="text-xs text-muted-foreground">Current email</p>
              </div>
            </div>
            <Badge variant={profile?.emailVerified ? "secondary" : "destructive"}>
              {profile?.emailVerified ? "Verified" : "Unverified"}
            </Badge>
          </div>

          {profile?.pendingEmail && (
            <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Verification email sent to <strong>{profile.pendingEmail}</strong>.
                Please check your inbox.
              </span>
            </div>
          )}

          <Separator />

          <form onSubmit={handleChangeEmail} className="space-y-3">
            <Label htmlFor="new-email">Change email address</Label>
            <div className="flex gap-3">
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value)
                  setEmailError("")
                  setEmailMessage("")
                }}
                placeholder="new@example.com"
                required
              />
              <Button type="submit" disabled={savingEmail || !newEmail.trim()}>
                {savingEmail && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send verification
              </Button>
            </div>

            {emailMessage && (
              <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                {emailMessage}
              </div>
            )}

            {emailError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {emailError}
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
