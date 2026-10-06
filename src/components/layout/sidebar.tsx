'use client'

import { useMounted } from '@/hooks/use-mounted';
import React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  FileText,
  Settings,
  Building,
  MessageSquare,
  Folder,
  X,
  CreditCard,
  Activity,
} from 'lucide-react'

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
  showNavigation?: boolean
}

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Home,
  },
  {
    name: 'Documents',
    href: '/documents',
    icon: Folder,
  },
  {
    name: 'AI Chat',
    href: '/chat',
    icon: MessageSquare,
  },
  {
    name: 'Activity Logs',
    href: '/logs',
    icon: Activity,
  },
]

const secondaryNavigation = [
  {
    name: 'Profile',
    href: '/profile',
    icon: Building,
  },
  {
    name: 'Billing',
    href: '/billing',
    icon: CreditCard,
  },
]

export function Sidebar({
  isOpen = true,
  onClose,
  showNavigation = true,
}: SidebarProps) {
  const pathname = usePathname()
  const isClient = useMounted();

  // Ensure client-side hydration


  const isCurrentPath = React.useCallback(
    (href: string) => {
      // During SSR, don't highlight any paths to prevent hydration mismatch
      if (!isClient) return false

      if (href === '/dashboard') {
        return pathname === '/dashboard'
      }
      return pathname.startsWith(href)
    },
    [pathname, isClient]
  )

  // Don't render sidebar if showNavigation is false
  if (!showNavigation) {
    return null
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-background border-r transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex h-16 items-center border-b px-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-sm font-semibold">DC</span>
              </div>
              <span className="font-semibold">Document Chat</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto md:hidden"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close sidebar</span>
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex-1 px-3 overflow-y-auto">
            <div className="space-y-4 py-4">
              {/* Primary Navigation */}
              <div className="px-3 py-2">
                <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                  Main
                </h2>
                <div className="space-y-1">
                  {navigation.map((item) => {
                    const isCurrent = isCurrentPath(item.href)
                    return (
                      <Button
                        key={item.name}
                        asChild
                        variant={isCurrent ? 'secondary' : 'ghost'}
                        className={cn(
                          'w-full justify-start',
                          isCurrent && 'bg-muted'
                        )}
                      >
                        <Link href={{ pathname: item.href }} prefetch={true}>
                          <item.icon className="mr-2 h-4 w-4" />
                          {item.name}
                        </Link>
                      </Button>
                    )
                  })}
                </div>
              </div>

              {/* Secondary Navigation */}
              <div className="px-3 py-2">
                <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                  Account
                </h2>
                <div className="space-y-1">
                  {secondaryNavigation.map((item) => {
                    const isCurrent = isCurrentPath(item.href)
                    return (
                      <Button
                        key={item.name}
                        asChild
                        variant={isCurrent ? 'secondary' : 'ghost'}
                        className="w-full justify-start"
                      >
                        <Link href={{ pathname: item.href }} prefetch={true}>
                          <item.icon className="mr-2 h-4 w-4" />
                          {item.name}
                        </Link>
                      </Button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t">
            <Button asChild variant="ghost" className="w-full justify-start">
              <Link href="/settings" prefetch={true}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
          </div>
        </div>
      </aside>
    </>
  )
}
