import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Building2, ArrowRight, Box, Brain, Users } from "lucide-react"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">IFC Platform</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/signin">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link href="/auth/register">
            <Button>Get started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mx-auto max-w-3xl space-y-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            IFC Model Management
            <br />
            <span className="text-muted-foreground">& Intelligent Analysis</span>
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            Upload, view, and analyze your BIM/IFC models with AI-powered insights.
            Manage projects, collaborate with your team, and extract valuable data
            from your building models.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/auth/register">
              <Button size="lg" className="gap-2">
                Start for free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/auth/signin">
              <Button variant="outline" size="lg">
                Sign in
              </Button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mx-auto mt-24 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Box className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">3D Visualization</h3>
            <p className="text-sm text-muted-foreground">
              Interactive Three.js rendering with IFC model parsing, selection, and
              X-Ray view support.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">AI Analysis</h3>
            <p className="text-sm text-muted-foreground">
              Ask questions about your models, get insights, and control views with
              natural language.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">Collaboration</h3>
            <p className="text-sm text-muted-foreground">
              Manage projects, annotate elements, and share your work with team
              members.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        IFC Model Management Platform - Graduation Project
      </footer>
    </div>
  )
}
