'use client'

import { useClock } from '@/hooks/use-clock'
import React from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Shield, CheckCircle, AlertTriangle, Building, Star, Users } from 'lucide-react'

// Security Clearance Badge
export interface SecurityClearanceBadgeProps {
  level: 'public' | 'confidential' | 'secret' | 'topsecret' | 'sci'
  expired?: boolean
  className?: string
}

const clearanceConfig = {
  public: {
    label: 'Public',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    icon: null
  },
  confidential: {
    label: 'Confidential',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Shield
  },
  secret: {
    label: 'Secret',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: Shield
  },
  topsecret: {
    label: 'Top Secret',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: Shield
  },
  sci: {
    label: 'Top Secret/SCI',
    color: 'bg-red-200 text-red-900 border-red-300',
    icon: Shield
  }
}

export function SecurityClearanceBadge({
  level,
  expired = false,
  className
}: SecurityClearanceBadgeProps) {
  const config = clearanceConfig[level]
  const Icon = config.icon

  return (
    <Badge
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        config.color,
        expired && "opacity-60 line-through",
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {config.label}
      {expired && <span className="text-xs">(Expired)</span>}
    </Badge>
  )
}

// Contract Type Badge
export interface ContractTypeBadgeProps {
  type: 'bpa' | 'idiq' | 'single' | 'multiple' | 'firm-fixed-price' | 'cost-plus' | 'time-materials'
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

const contractTypeConfig = {
  bpa: {
    label: 'BPA',
    fullLabel: 'Blanket Purchase Agreement',
    color: 'bg-orange-100 text-orange-800 border-orange-200'
  },
  idiq: {
    label: 'IDIQ',
    fullLabel: 'Indefinite Delivery/Indefinite Quantity',
    color: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  single: {
    label: 'Single Award',
    fullLabel: 'Single Award Contract',
    color: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  multiple: {
    label: 'Multiple Award',
    fullLabel: 'Multiple Award Contract',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  'firm-fixed-price': {
    label: 'FFP',
    fullLabel: 'Firm Fixed Price',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  'cost-plus': {
    label: 'CP',
    fullLabel: 'Cost Plus',
    color: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  'time-materials': {
    label: 'T&M',
    fullLabel: 'Time & Materials',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200'
  }
}

export function ContractTypeBadge({
  type,
  size = 'default',
  className
}: ContractTypeBadgeProps) {
  const config = contractTypeConfig[type]

  return (
    <Badge
      size={size}
      className={cn(
        "font-medium",
        config.color,
        className
      )}
      title={config.fullLabel}
    >
      {config.label}
    </Badge>
  )
}

// Agency Badge
export interface AgencyBadgeProps {
  agency: string
  tier?: 'federal' | 'state' | 'local'
  verified?: boolean
  className?: string
}

const tierConfig = {
  federal: {
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Building
  },
  state: {
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: Building
  },
  local: {
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: Building
  }
}

export function AgencyBadge({
  agency,
  tier = 'federal',
  verified = false,
  className
}: AgencyBadgeProps) {
  const config = tierConfig[tier]
  const Icon = config.icon

  return (
    <Badge
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        config.color,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {agency}
      {verified && <CheckCircle className="h-3 w-3 text-green-600" />}
    </Badge>
  )
}

// Certification Badge
export interface CertificationBadgeProps {
  cert: '8a' | 'hubzone' | 'sdvosb' | 'wosb' | 'vosb' | 'small-business' | 'disadvantaged'
  verified?: boolean
  expires?: Date
  className?: string
}

const certificationConfig = {
  '8a': {
    label: '8(a) Business Development',
    shortLabel: '8(a)',
    color: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  'hubzone': {
    label: 'HUBZone Certified',
    shortLabel: 'HUBZone',
    color: 'bg-orange-100 text-orange-800 border-orange-200'
  },
  'sdvosb': {
    label: 'Service-Disabled Veteran-Owned Small Business',
    shortLabel: 'SDVOSB',
    color: 'bg-red-100 text-red-800 border-red-200'
  },
  'wosb': {
    label: 'Woman-Owned Small Business',
    shortLabel: 'WOSB',
    color: 'bg-pink-100 text-pink-800 border-pink-200'
  },
  'vosb': {
    label: 'Veteran-Owned Small Business',
    shortLabel: 'VOSB',
    color: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  'small-business': {
    label: 'Small Business',
    shortLabel: 'SB',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  'disadvantaged': {
    label: 'Economically Disadvantaged',
    shortLabel: 'EDWOSB',
    color: 'bg-teal-100 text-teal-800 border-teal-200'
  }
}

export function CertificationBadge({
  cert,
  verified = false,
  expires,
  className
}: CertificationBadgeProps) {
  const now = useClock()
  const config = certificationConfig[cert]
  const isExpired = expires && expires < new Date()
  const isExpiringSoon = expires && expires < new Date(now + 30 * 24 * 60 * 60 * 1000)

  return (
    <Badge
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        config.color,
        isExpired && "opacity-60 line-through",
        className
      )}
      title={config.label}
    >
      {config.shortLabel}
      {verified && <CheckCircle className="h-3 w-3 text-green-600" />}
      {isExpiringSoon && !isExpired && <AlertTriangle className="h-3 w-3 text-orange-600" />}
      {isExpired && <span className="text-xs">(Expired)</span>}
    </Badge>
  )
}

// NAICS Code Badge
export interface NAICSBadgeProps {
  code: string
  description?: string
  primary?: boolean
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

export function NAICSBadge({
  code,
  description,
  primary = false,
  size = 'default',
  className
}: NAICSBadgeProps) {
  return (
    <Badge
      size={size}
      className={cn(
        "font-mono",
        primary 
          ? "bg-primary text-primary-foreground border-primary" 
          : "bg-muted text-muted-foreground border-muted",
        className
      )}
      title={description || `NAICS Code: ${code}`}
    >
      {primary && <Star className="h-3 w-3 mr-1" />}
      {code}
    </Badge>
  )
}

// Set-Aside Badge
export interface SetAsideBadgeProps {
  type: 'unrestricted' | 'total_small_business' | 'partial_small_business' | 'small-business' | 'wosb' | 'vosb' | 'hubzone' | '8a' | 'sdvosb'
  className?: string
}

const setAsideConfig = {
  unrestricted: {
    label: 'Unrestricted',
    color: 'bg-gray-100 text-gray-800 border-gray-200'
  },
  'total_small_business': {
    label: 'Total Small Business Set-Aside',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  'partial_small_business': {
    label: 'Partial Small Business Set-Aside',
    color: 'bg-green-50 text-green-700 border-green-200'
  },
  'small-business': {
    label: 'Small Business Set-Aside',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  wosb: {
    label: 'WOSB Set-Aside',
    color: 'bg-pink-100 text-pink-800 border-pink-200'
  },
  vosb: {
    label: 'VOSB Set-Aside',
    color: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  hubzone: {
    label: 'HUBZone Set-Aside',
    color: 'bg-orange-100 text-orange-800 border-orange-200'
  },
  '8a': {
    label: '8(a) Set-Aside',
    color: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  sdvosb: {
    label: 'SDVOSB Set-Aside',
    color: 'bg-red-100 text-red-800 border-red-200'
  }
}

export function SetAsideBadge({
  type,
  className
}: SetAsideBadgeProps) {
  const config = setAsideConfig[type]

  return (
    <Badge
      className={cn(
        "font-medium",
        config.color,
        className
      )}
    >
      {config.label}
    </Badge>
  )
}

// Team Size Badge
export interface TeamSizeBadgeProps {
  size: 'solo' | 'small' | 'medium' | 'large' | 'enterprise'
  count?: number
  className?: string
}

const teamSizeConfig = {
  solo: {
    label: 'Solo',
    range: '1',
    color: 'bg-gray-100 text-gray-800 border-gray-200'
  },
  small: {
    label: 'Small Team',
    range: '2-10',
    color: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  medium: {
    label: 'Medium Team',
    range: '11-50',
    color: 'bg-green-100 text-green-800 border-green-200'
  },
  large: {
    label: 'Large Team',
    range: '51-200',
    color: 'bg-orange-100 text-orange-800 border-orange-200'
  },
  enterprise: {
    label: 'Enterprise',
    range: '200+',
    color: 'bg-purple-100 text-purple-800 border-purple-200'
  }
}

export function TeamSizeBadge({
  size,
  count,
  className
}: TeamSizeBadgeProps) {
  const config = teamSizeConfig[size]
  const displayText = count ? `${count} people` : config.label

  return (
    <Badge
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        config.color,
        className
      )}
      title={`Team size: ${config.range} people`}
    >
      <Users className="h-3 w-3" />
      {displayText}
    </Badge>
  )
}