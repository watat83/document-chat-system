'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { DonationBanner } from '@/components/donation/donation-banner'
import {
  MessageCircle,
  FileText,
  Search,
  Upload,
  ArrowRight,
  Users,
  Sparkles,
  Shield,
  Zap,
  Files,
  Bot,
  Code,
  Database,
  Lock,
  Globe,
  CloudUpload,
  Activity,
  Layers,
  Terminal,
  CheckCircle,
  GitBranch,
  Server,
  Cpu,
  HardDrive,
  Network,
  Github,
  Menu,
  X,
  MessageSquare
} from 'lucide-react'
import { useState, useEffect } from 'react'

export function LandingPageClient() {
  const [activeSection, setActiveSection] = useState<string>('')
  const [starCount, setStarCount] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [donationBannerVisible, setDonationBannerVisible] = useState(true)

  useEffect(() => {
    // Fetch GitHub stars count with proper error handling
    const fetchStars = async () => {
      try {
        const res = await fetch('https://api.github.com/repos/watat83/document-chat-system', {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
          },
        })

        if (!res.ok) {
          // Repository might be new or private, silently fail
          return
        }

        const data = await res.json()
        if (data.stargazers_count !== undefined) {
          setStarCount(data.stargazers_count)
        }
      } catch (err) {
        // Silently fail - stars count is not critical
        // Repository might be too new or API rate limited
      }
    }

    fetchStars()
  }, [])

  // JSON-LD structured data for SEO
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': 'Document Chat System',
    'applicationCategory': 'BusinessApplication',
    'description': 'AI-powered document analysis and intelligent chat platform. Upload PDFs, Word documents, images and more. Chat with AI using semantic search and RAG (Retrieval Augmented Generation).',
    'operatingSystem': 'Web',
    'offers': {
      '@type': 'Offer',
      'price': '0',
      'priceCurrency': 'USD',
    },
    'aggregateRating': {
      '@type': 'AggregateRating',
      'ratingValue': '5',
      'ratingCount': '1',
    },
    'featureList': [
      'AI-powered document chat',
      'Multi-provider AI support (OpenRouter, OpenAI, Anthropic)',
      'Semantic search with vector embeddings',
      'PDF, DOCX, TXT, image support',
      'RAG (Retrieval Augmented Generation)',
      'Multi-tenant architecture',
      'Enterprise security with AES-256 encryption',
      'Background document processing',
    ],
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Donation Banner */}
      <DonationBanner onVisibilityChange={setDonationBannerVisible} />

      {/* Sticky Header with Navigation - positioned below donation banner when visible */}
      <header className={`sticky ${donationBannerVisible ? 'top-[48px]' : 'top-0'} z-40 px-4 lg:px-6 h-14 flex items-center border-b bg-white/95 dark:bg-gray-950/95 backdrop-blur supports-[backdrop-filter]:bg-white/95 dark:supports-[backdrop-filter]:bg-gray-950/95 transition-all duration-300`}>
        <Link className="flex items-center justify-center" href="/">
          <Files className="h-6 w-6 text-blue-600 dark:text-blue-400 sm:mr-2" />
          <span className="font-bold text-lg hidden sm:inline">Document Chat System</span>
        </Link>
        {/* Desktop Navigation */}
        <nav className="ml-auto hidden md:flex gap-2 sm:gap-4 items-center">
          <Link href="#use-cases" className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            Use Cases
          </Link>
          <Link href="#features" className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            Features
          </Link>
          <Link href="#how-it-works" className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            How It Works
          </Link>
          <Link href="#tech-stack" className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            Tech Stack
          </Link>
          <ThemeToggle />
          <Link href="/sign-in/">
            <Button variant="outline" size="sm">Sign In</Button>
          </Link>
          <Link href="/sign-up/">
            <Button size="sm">Get Started</Button>
          </Link>
          <Link
            href="https://github.com/watat83/document-chat-system"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden lg:inline-block"
          >
            <Button variant="outline" className="gap-2">
              <Github className="h-4 w-4" />
              <span>Star on GitHub</span>
              {starCount !== null && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                  {starCount.toLocaleString()}
                </Badge>
              )}
            </Button>
          </Link>
        </nav>

        {/* Mobile Navigation */}
        <div className="ml-auto flex md:hidden items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b bg-white dark:bg-gray-950 shadow-lg">
          <nav className="flex flex-col p-4 space-y-3">
            <Link
              href="#use-cases"
              className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Use Cases
            </Link>
            <Link
              href="#features"
              className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              How It Works
            </Link>
            <Link
              href="#tech-stack"
              className="text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Tech Stack
            </Link>
            <Link
              href="https://github.com/watat83/document-chat-system"
              target="_blank"
              rel="noopener noreferrer"
              className="py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Button variant="outline" className="w-full gap-2 justify-center">
                <Github className="h-4 w-4" />
                <span>Star on GitHub</span>
                {starCount !== null && (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                    {starCount.toLocaleString()}
                  </Badge>
                )}
              </Button>
            </Link>
            <div className="flex gap-2 pt-2 border-t">
              <Link href="/sign-in/" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" size="sm" className="w-full">Sign In</Button>
              </Link>
              <Link href="/sign-up/" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                <Button size="sm" className="w-full">Get Started</Button>
              </Link>
            </div>
          </nav>
        </div>
      )}

      {/* Hero Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-6 text-center">
            <Badge variant="secondary" className="mb-4">
              <GitBranch className="h-3 w-3 mr-1" />
              Open Source • MIT Licensed
            </Badge>
            <div className="space-y-4">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 animate-gradient-text">
                AI-Powered Document Chat System
              </h1>
              <p className="mx-auto max-w-[800px] text-gray-600 md:text-xl lg:text-2xl dark:text-gray-300">
                Upload documents, chat with AI about their content, and extract insights instantly.
                Powered by advanced AI models with semantic search and intelligent document processing.
              </p>
              <p className="mx-auto max-w-[700px] text-gray-500 md:text-lg dark:text-gray-400">
                Open-source document chat platform built with Next.js 15, React 19, and TypeScript.
                Deploy your own instance with optional billing to monetize as a SaaS.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-3xl mx-auto">
              <Link href="/sign-up/" className="flex-1">
                <Button size="lg" className="w-full">
                  <Sparkles className="mr-2 h-5 w-5" />
                  Start Chatting for Free
                </Button>
              </Link>
              <Link href="https://github.com/watat83/document-chat-system" className="flex-1">
                <Button variant="outline" size="lg" className="w-full">
                  <GitBranch className="mr-2 h-5 w-5" />
                  View on GitHub
                </Button>
              </Link>
              <Link href="https://discord.gg/ubWcC2PS" target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" size="lg" className="w-full">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Join Discord
                </Button>
              </Link>
            </div>

            {/* YouTube Video Demo */}
            <div className="w-full max-w-4xl mx-auto pt-8">
              <div className="relative rounded-xl overflow-hidden shadow-2xl border-4 border-gray-200 dark:border-gray-700">
                <div className="aspect-video">
                  <iframe
                    width="100%"
                    height="100%"
                    src="https://www.youtube.com/embed/P42nlCmicVM?si=SKnyKRVOJpAC9kDn"
                    title="Document Chat System Demo"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    className="absolute inset-0"
                  />
                </div>
              </div>
              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
                Watch the complete demo and walkthrough
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-gray-600 dark:text-gray-400 pt-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600" />
                <span>100% Free to Use</span>
              </div>
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-blue-600" />
                <span>Self-Hosted</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-purple-600" />
                <span>Privacy-First</span>
              </div>
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-orange-600" />
                <span>No Vendor Lock-In</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section id="use-cases" className="w-full py-12 md:py-24 lg:py-32 bg-gray-50 dark:bg-gray-900">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <Badge variant="outline">Use Cases</Badge>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Built for Every Industry
            </h2>
            <p className="max-w-[900px] text-gray-600 md:text-xl dark:text-gray-400">
              From knowledge management to customer support, Document Chat System adapts to your needs
            </p>
          </div>

          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>Knowledge Management</CardTitle>
                <CardDescription>
                  Build searchable knowledge bases, research libraries, and personal &quot;second brains&quot; with AI-powered recall
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>Customer Support</CardTitle>
                <CardDescription>
                  Train support teams with product manuals, policies, and FAQs for instant AI-powered answers
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                  <Terminal className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>Developer Docs</CardTitle>
                <CardDescription>
                  Create interactive API documentation and technical guides where developers can ask questions
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-4">
                  <Activity className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <CardTitle>Legal & Compliance</CardTitle>
                <CardDescription>
                  Maintain regulatory documents and get instant answers about compliance requirements and policies
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center mb-4">
                  <Sparkles className="h-6 w-6 text-pink-600 dark:text-pink-400" />
                </div>
                <CardTitle>Education & Research</CardTitle>
                <CardDescription>
                  Upload textbooks, lecture notes, and research papers for AI-powered tutoring and study assistance
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center mb-4">
                  <Globe className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <CardTitle>White-Label SaaS</CardTitle>
                <CardDescription>
                  Deploy as your own branded document management platform with built-in billing and multi-tenancy
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          <div className="mt-12 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              And many more: HR onboarding, content creation, medical research, property management, and more
            </p>
            <Link href="https://github.com/watat83/document-chat-system#use-cases" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="lg">
                View All Use Cases
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Core Features Section */}
      <section id="features" className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <Badge variant="outline">Features</Badge>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Everything You Need for Document AI
            </h2>
            <p className="max-w-[900px] text-gray-600 md:text-xl dark:text-gray-400">
              A complete, production-ready platform with advanced features for document management,
              AI chat, vector search, multi-tenancy, and optional monetization.
            </p>
          </div>

          {/* Main Feature Cards */}
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3 mb-12">
            <Card className="border-2 hover:border-blue-500 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <Bot className="h-10 w-10 text-blue-600" />
                  <Badge variant="secondary">Core</Badge>
                </div>
                <CardTitle className="text-xl">Multi-Provider AI Chat</CardTitle>
                <CardDescription className="text-base">
                  Unified interface supporting <strong>OpenRouter (100+ models)</strong>, <strong>OpenAI</strong>, and <strong>ImageRouter</strong>.
                  Switch providers seamlessly with intelligent routing, streaming responses, and conversation history.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>100+ AI models via OpenRouter</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>OpenAI GPT-4 Turbo & GPT-3.5</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>ImageRouter for image generation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Streaming responses with SSE</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Context-aware conversations</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-green-500 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <FileText className="h-10 w-10 text-green-600" />
                  <Badge variant="secondary">Processing</Badge>
                </div>
                <CardTitle className="text-xl">Advanced Document Processing</CardTitle>
                <CardDescription className="text-base">
                  Intelligent extraction and processing for <strong>5+ file formats</strong> including PDFs, Office documents,
                  images, and more. Background processing with Inngest for scalability.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>PDF, DOCX, TXT, MD, and images</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Image OCR and vision AI</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Metadata extraction & analysis</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Batch processing with queues</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Real-time progress tracking</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-purple-500 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <Search className="h-10 w-10 text-purple-600" />
                  <Badge variant="secondary">Search</Badge>
                </div>
                <CardTitle className="text-xl">Vector Search & Embeddings</CardTitle>
                <CardDescription className="text-base">
                  Semantic search powered by <strong>Pinecone</strong> or <strong>pgvector</strong>. Find relevant content
                  across thousands of documents with AI-powered similarity matching.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Pinecone serverless indexes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>PostgreSQL pgvector support</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Hybrid search (semantic + keyword)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Automatic chunking & embedding</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Namespace isolation per org</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-orange-500 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <Users className="h-10 w-10 text-orange-600" />
                  <Badge variant="secondary">Multi-Tenant</Badge>
                </div>
                <CardTitle className="text-xl">Multi-Tenant Architecture</CardTitle>
                <CardDescription className="text-base">
                  Enterprise-grade multi-tenancy with complete data isolation, organization management,
                  role-based access control, and team collaboration features.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Organization-based isolation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Role-based permissions (RBAC)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Team member invitations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Per-org resource limits</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Shared folders & documents</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-pink-500 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <Database className="h-10 w-10 text-pink-600" />
                  <Badge variant="secondary">Infrastructure</Badge>
                </div>
                <CardTitle className="text-xl">Organization & Folder Management</CardTitle>
                <CardDescription className="text-base">
                  Hierarchical folder structure with drag-and-drop organization, bulk operations,
                  and intelligent document categorization.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Nested folder hierarchies</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Drag-and-drop organization</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Bulk move & copy operations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Smart folder suggestions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Folder-level permissions</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-yellow-500 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <Zap className="h-10 w-10 text-yellow-600" />
                  <Badge variant="secondary">Background Jobs</Badge>
                </div>
                <CardTitle className="text-xl">Background Job Processing</CardTitle>
                <CardDescription className="text-base">
                  Scalable background processing with <strong>Inngest</strong> for document processing,
                  embeddings, notifications, and scheduled tasks.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Inngest serverless functions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Retry logic & error handling</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Scheduled cron jobs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Event-driven workflows</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Job monitoring & logging</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Additional Features Grid */}
          <div className="mx-auto max-w-6xl">
            <h3 className="text-2xl font-bold text-center mb-8">And Much More...</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <CloudUpload className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-1">Supabase File Storage</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Scalable cloud storage with CDN distribution</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <Network className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-1">Redis Caching</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Lightning-fast responses with Upstash Redis</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <Layers className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-1">Type-Safe APIs</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">End-to-end TypeScript with Zod validation</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <Globe className="h-5 w-5 text-orange-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-1">Real-Time Updates</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Live document sync and chat streaming</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <Server className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-1">Docker Ready</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Production Dockerfile with optimization</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <Cpu className="h-5 w-5 text-indigo-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-1">Edge Optimized</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Fast global delivery with edge functions</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="w-full py-12 md:py-24 lg:py-32 bg-gray-50 dark:bg-gray-900">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <Badge variant="outline">How It Works</Badge>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              From Upload to AI Conversation in Seconds
            </h2>
            <p className="max-w-[900px] text-gray-600 md:text-xl dark:text-gray-400">
              Our intelligent pipeline processes documents automatically and makes them instantly searchable
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-3 mb-12">
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
                <Upload className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">1. Upload Documents</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Drag and drop any document - PDFs, Word documents, text files, images, and more.
                  Organize in folders or let AI categorize them automatically.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg">
                <Bot className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">2. AI Processing</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Advanced document processors extract text, metadata, and meaning.
                  Content is chunked, embedded, and indexed for semantic search in real-time.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-center space-y-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg">
                <MessageCircle className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold">3. Start Chatting</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Ask questions in natural language. AI retrieves relevant content and generates
                  accurate answers with citations to source documents.
                </p>
              </div>
            </div>
          </div>

          {/* Technical Details */}
          <div className="mx-auto max-w-4xl mt-12">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Under the Hood
                </CardTitle>
                <CardDescription>The technology powering intelligent document conversations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      Document Processing
                    </h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                      <li>• Custom parsers for each file type</li>
                      <li>• OCR for scanned documents & images</li>
                      <li>• Metadata extraction & enrichment</li>
                      <li>• Intelligent chunking algorithms</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Search className="h-4 w-4 text-green-600" />
                      Vector Embeddings
                    </h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                      <li>• OpenAI text-embedding-3-large</li>
                      <li>• Pinecone serverless indexes</li>
                      <li>• Semantic similarity matching</li>
                      <li>• Hybrid search (vector + keyword)</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Bot className="h-4 w-4 text-purple-600" />
                      AI Conversation
                    </h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                      <li>• RAG (Retrieval Augmented Generation)</li>
                      <li>• Context window management</li>
                      <li>• Source attribution & citations</li>
                      <li>• Streaming token responses</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-600" />
                      Background Jobs
                    </h4>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                      <li>• Inngest event-driven functions</li>
                      <li>• Automatic retries & error handling</li>
                      <li>• Queue-based processing</li>
                      <li>• Real-time progress updates</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section id="tech-stack" className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <Badge variant="outline">Technology</Badge>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Built with Modern, Production-Ready Stack
            </h2>
            <p className="max-w-[900px] text-gray-600 md:text-xl dark:text-gray-400">
              Leveraging the latest technologies for performance, scalability, and developer experience
            </p>
          </div>

          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Frontend */}
            <Card>
              <CardHeader>
                <Code className="h-8 w-8 text-blue-600 mb-2" />
                <CardTitle>Frontend</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">React 19</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Next.js 15</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">TypeScript 5</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Tailwind CSS</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Radix UI</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Zustand</Badge>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Backend */}
            <Card>
              <CardHeader>
                <Server className="h-8 w-8 text-green-600 mb-2" />
                <CardTitle>Backend</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Next.js API Routes</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Prisma ORM</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">PostgreSQL</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Clerk Auth</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Zod Validation</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">tRPC</Badge>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* AI & ML */}
            <Card>
              <CardHeader>
                <Bot className="h-8 w-8 text-purple-600 mb-2" />
                <CardTitle>AI & ML</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">OpenRouter (100+ models)</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">OpenAI</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">ImageRouter</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Pinecone</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">pgvector</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">LangChain</Badge>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Infrastructure */}
            <Card>
              <CardHeader>
                <HardDrive className="h-8 w-8 text-orange-600 mb-2" />
                <CardTitle>Infrastructure</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Supabase</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Upstash Redis</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Inngest</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Docker</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Stripe (optional)</Badge>
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Sentry</Badge>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="mt-12 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              All dependencies are actively maintained and production-proven at scale
            </p>
            <Link href="https://github.com/watat83/document-chat-system">
              <Button variant="outline">
                <GitBranch className="mr-2 h-4 w-4" />
                View Full Stack on GitHub
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Monetization Section */}
      <section id="monetization" className="w-full py-12 md:py-24 lg:py-32 bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <Badge variant="outline">Built-in Monetization</Badge>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Turn Your Deployment into a SaaS Business
            </h2>
            <p className="max-w-[900px] text-gray-600 md:text-xl dark:text-gray-400">
              <strong>Optional Stripe integration</strong> lets you charge users for your deployment.
              Subscription management, usage limits, and billing are built-in and ready to go.
            </p>
            <Badge variant="secondary" className="text-sm">
              <Shield className="h-3 w-3 mr-1" />
              Billing features are 100% optional - self-host for free without any payment integration
            </Badge>
          </div>

          {/* Customization Example */}
          <div className="mx-auto max-w-4xl mb-12">
            <Card className="border-2 border-blue-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Easy Pricing Customization
                </CardTitle>
                <CardDescription>
                  Create pricing plans via API or directly in the database, then sync with Stripe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4 text-center">
                  <div className="p-4 border rounded-lg">
                    <Terminal className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <h4 className="font-semibold mb-1">Use Admin API</h4>
                    <p className="text-sm text-gray-600">POST /api/v1/admin/pricing-plans</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <Database className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <h4 className="font-semibold mb-1">Or Edit Database</h4>
                    <p className="text-sm text-gray-600">pricing_plans table via Prisma</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <Zap className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                    <h4 className="font-semibold mb-1">Stripe Sync</h4>
                    <p className="text-sm text-gray-600">Optional auto-sync with Stripe</p>
                  </div>
                </div>

                <div className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto">
                  <pre className="text-sm"><code>{`{
  planType: "STARTER",
  displayName: "Starter Plan",
  description: "Perfect for individuals",
  monthlyPrice: 2900, // $29 in cents
  yearlyPrice: 29000, // $290 yearly (2 months free)
  currency: "usd",
  features: {
    list: [
      "3 user seats",
      "500 AI credits/month",
      "100 documents/month",
      "Priority support"
    ]
  },
  limits: {
    seats: 3,
    documentsPerMonth: 100,
    aiCreditsPerMonth: 500,
    storageGB: 10
  },
  isActive: true,
  isPopular: true,
  displayOrder: 1,
  createStripeProducts: true
}`}</code></pre>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Fully customizable limits including: <code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">seats</code>,
                  {' '}<code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">documentsPerMonth</code>,
                  {' '}<code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">aiCreditsPerMonth</code>,
                  {' '}<code className="bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">storageGB</code>, and more
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Pricing Tiers Example */}
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>Free</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">$0</span>
                  <span className="text-gray-600 dark:text-gray-400">/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    1 user seat
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    50 AI credits/month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    100 pages/month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Basic support
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-500">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Starter</CardTitle>
                  <Badge>Popular</Badge>
                </div>
                <div className="mt-4">
                  <span className="text-4xl font-bold">$29</span>
                  <span className="text-gray-600 dark:text-gray-400">/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    3 user seats
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    500 AI credits/month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    1,000 pages/month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Priority support
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Professional</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">$99</span>
                  <span className="text-gray-600 dark:text-gray-400">/month</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    10 user seats
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    2,000 AI credits/month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    5,000 pages/month
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Premium support
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enterprise</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">Custom</span>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Unlimited seats
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Custom AI credits
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Unlimited pages
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    24/7 dedicated support
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              These are examples - fully customizable to your needs. Disable billing entirely if you just want to self-host for free.
            </p>
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-gray-50 dark:bg-gray-900">
        <div className="container px-4 md:px-6">
          <div className="mx-auto max-w-4xl text-center space-y-6">
            <Badge variant="outline" className="mb-4">
              <GitBranch className="h-3 w-3 mr-1" />
              Open Source
            </Badge>
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Free Forever, Open to Everyone
            </h2>
            <p className="text-gray-600 md:text-xl dark:text-gray-400">
              Document Chat System is MIT licensed. Use it for personal projects, commercial products,
              or build your own SaaS business. No restrictions, no vendor lock-in.
            </p>
            <div className="grid md:grid-cols-3 gap-6 mt-8">
              <div className="p-6 border rounded-lg">
                <Code className="h-10 w-10 text-blue-600 mx-auto mb-4" />
                <h3 className="font-semibold mb-2">MIT License</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Permissive license allowing commercial use, modification, and distribution
                </p>
              </div>
              <div className="p-6 border rounded-lg">
                <Users className="h-10 w-10 text-green-600 mx-auto mb-4" />
                <h3 className="font-semibold mb-2">Community Driven</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Active development, regular updates, and welcoming community contributions
                </p>
              </div>
              <div className="p-6 border rounded-lg">
                <Shield className="h-10 w-10 text-purple-600 mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Vendor Lock-In</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Self-host anywhere, use your own infrastructure, keep full control of your data
                </p>
              </div>
            </div>
            <div className="pt-6">
              <Link href="https://github.com/watat83/document-chat-system">
                <Button size="lg" variant="outline">
                  <GitBranch className="mr-2 h-5 w-5" />
                  Star on GitHub
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-4">
            <div className="flex flex-col items-center space-y-2 p-6 border rounded-lg">
              <Files className="h-12 w-12 text-blue-600" />
              <div className="text-4xl font-bold">5+</div>
              <p className="text-gray-600 dark:text-gray-400 text-center">Supported File Formats</p>
            </div>
            <div className="flex flex-col items-center space-y-2 p-6 border rounded-lg">
              <Bot className="h-12 w-12 text-green-600" />
              <div className="text-4xl font-bold">100+</div>
              <p className="text-gray-600 dark:text-gray-400 text-center">AI Models Available</p>
            </div>
            <div className="flex flex-col items-center space-y-2 p-6 border rounded-lg">
              <Zap className="h-12 w-12 text-purple-600" />
              <div className="text-4xl font-bold">99.9%</div>
              <p className="text-gray-600 dark:text-gray-400 text-center">Uptime SLA</p>
            </div>
            <div className="flex flex-col items-center space-y-2 p-6 border rounded-lg">
              <Shield className="h-12 w-12 text-orange-600" />
              <div className="text-4xl font-bold">100%</div>
              <p className="text-gray-600 dark:text-gray-400 text-center">Open Source</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-gray-50 dark:bg-gray-900">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="mx-auto max-w-3xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What AI models can I use?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">
                  You can use any model from <strong>OpenRouter</strong> (100+ models including GPT-4, Claude, Llama, Mistral, and more),
                  <strong>OpenAI</strong> directly (GPT-4 Turbo, GPT-3.5), or <strong>ImageRouter</strong> for image generation.
                  The system supports switching between providers seamlessly.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Do I need to pay for AI API usage?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">
                  The platform is free and open source. Configure your AI provider API keys to enable chat features.
                  Supports multiple AI providers including OpenRouter, OpenAI, Anthropic, and more.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I monetize my deployment?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">
                  Yes! The optional Stripe integration lets you create subscription plans, set usage limits,
                  and charge users for your deployment. It&apos;s completely optional - you can also run it for free without any billing features.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How do I self-host this?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">
                  Deploy to <strong>Vercel</strong> with our automated setup script that syncs all environment variables in one command.
                  Or use the included production-ready Dockerfile for any platform that supports Docker (AWS, GCP, Azure, DigitalOcean, Railway, Render).
                  Full step-by-step deployment guide with automated scripts available in the README.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white animate-gradient" style={{ backgroundSize: '200% 200%' }}>
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-6 text-center">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
                Ready to Transform Your Documents?
              </h2>
              <p className="max-w-[700px] text-blue-100 md:text-xl">
                Start chatting with your documents today. Free, open source, and ready to deploy.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl">
              <Link href="/sign-up/" className="flex-1">
                <Button size="lg" variant="secondary" className="w-full">
                  <Sparkles className="mr-2 h-5 w-5" />
                  Start Free Trial
                </Button>
              </Link>
              <Link href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwatat83%2Fdocument-chat-system&env=DATABASE_URL,NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,INNGEST_EVENT_KEY,INNGEST_SIGNING_KEY&envDescription=Required%20environment%20variables%20for%20Document%20Chat%20System&envLink=https%3A%2F%2Fgithub.com%2Fwatat83%2Fdocument-chat-system%2Fblob%2Fmain%2F.env.example&project-name=document-chat-system&repository-name=document-chat-system" className="flex-1" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="default" className="w-full bg-black hover:bg-gray-900 text-white">
                  <Zap className="mr-2 h-5 w-5" />
                  Deploy to Vercel
                </Button>
              </Link>
              <Link href="https://github.com/watat83/document-chat-system" className="flex-1">
                <Button size="lg" variant="outline" className="w-full bg-transparent text-white border-white hover:bg-white hover:text-blue-600">
                  <GitBranch className="mr-2 h-5 w-5" />
                  View on GitHub
                </Button>
              </Link>
            </div>
            <p className="text-sm text-blue-100">
              No credit card required • Deploy in minutes • 100% open source
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col gap-4 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          © 2025 Document Chat System. MIT Licensed. Built with ❤️ for the open source community.
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="https://github.com/watat83/document-chat-system">
            GitHub
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="https://discord.gg/ubWcC2PS" target="_blank" rel="noopener noreferrer">
            Discord
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="https://github.com/watat83/document-chat-system/blob/main/README.md">
            Documentation
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="https://github.com/watat83/document-chat-system/issues">
            Issues
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="https://github.com/watat83/document-chat-system/blob/main/LICENSE">
            License
          </Link>
        </nav>
      </footer>
    </div>
  )
}
