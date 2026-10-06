'use client'

import { useOptionalNotifications } from '@/contexts/notification-context'

import { useState, useEffect, useCallback, useRef } from 'react'

// Network connection types
export enum ConnectionType {
  ETHERNET = 'ethernet',
  WIFI = 'wifi',
  CELLULAR_4G = '4g',
  CELLULAR_3G = '3g',
  CELLULAR_2G = '2g',
  CELLULAR_SLOW = 'slow-2g',
  UNKNOWN = 'unknown',
  NONE = 'none'
}

// Network quality levels
export enum NetworkQuality {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  OFFLINE = 'offline'
}

// Network status state
export interface NetworkStatus {
  isOnline: boolean
  connectionType: ConnectionType
  effectiveConnection: ConnectionType
  downlink: number | null // Mbps
  rtt: number | null // Round-trip time in ms
  quality: NetworkQuality
  lastOnline: Date | null
  lastOffline: Date | null
  reconnectAttempts: number
}

// Network monitoring configuration
interface NetworkStatusConfig {
  showNotifications?: boolean
  pingUrl?: string
  pingInterval?: number
  notifyOnStatusChange?: boolean
  notifyOnQualityChange?: boolean
  autoReconnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
}

// Default ping URL (should be a lightweight endpoint)
const DEFAULT_PING_URL = '/api/v1/health'
const DEFAULT_PING_INTERVAL = 30000 // 30 seconds
const DEFAULT_RECONNECT_DELAY = 5000 // 5 seconds

/**
 * Network Status Hook
 *
 * Provides comprehensive network monitoring with:
 * - Online/offline detection
 * - Connection quality assessment
 * - Automatic reconnection attempts
 * - Network speed estimation
 * - Integration with notification system
 */
export function useNetworkStatus(config: NetworkStatusConfig = {}) {
  const {
    showNotifications = true,
    pingUrl = DEFAULT_PING_URL,
    pingInterval = DEFAULT_PING_INTERVAL,
    notifyOnStatusChange = true,
    notifyOnQualityChange = true,
    autoReconnect = true,
    reconnectDelay = DEFAULT_RECONNECT_DELAY,
    maxReconnectAttempts = 5
  } = config

  const notifications = useOptionalNotifications();
  const showInfo = notifications?.info;
  const showWarning = notifications?.warning;
  const showSuccess = notifications?.success;

  // Refs for stable notification functions
  const showSuccessRef = useRef(showSuccess)
  const showWarningRef = useRef(showWarning)
  const showInfoRef = useRef(showInfo)

  // Refs for stable callback functions
  const updateStatusRef = useRef<((forceOnlineCheck?: boolean) => Promise<void>) | undefined>(undefined)
  const attemptReconnectionRef = useRef<((forceOnlineCheck?: boolean) => Promise<void>) | undefined>(undefined)
  const resetReconnectionRef = useRef<(() => void) | undefined>(undefined)
  const performPingRef = useRef<(() => Promise<boolean>) | undefined>(undefined)

  // Update refs when functions change
  useEffect(() => {
    showSuccessRef.current = showSuccess
    showWarningRef.current = showWarning
    showInfoRef.current = showInfo
  }, [showSuccess, showWarning, showInfo])

  // Update callback refs
  useEffect(() => {
    updateStatusRef.current = updateStatus
    attemptReconnectionRef.current = attemptReconnection
    resetReconnectionRef.current = resetReconnection
    performPingRef.current = performPing
  })

  // Initial state based on browser API
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    connectionType: ConnectionType.UNKNOWN,
    effectiveConnection: ConnectionType.UNKNOWN,
    downlink: null,
    rtt: null,
    quality: NetworkQuality.GOOD,
    lastOnline: null,
    lastOffline: null,
    reconnectAttempts: 0
  })

  // Refs for managing intervals and reconnection
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastNotifiedQualityRef = useRef<NetworkQuality>(status.quality)
  const isReconnectingRef = useRef(false)

  /**
   * Get connection type from Network Information API
   */
  const getConnectionInfo = useCallback((): Partial<NetworkStatus> => {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return {}
    }

    const connection = (navigator as any).connection

    return {
      connectionType: connection.type || ConnectionType.UNKNOWN,
      effectiveConnection: mapEffectiveType(connection.effectiveType),
      downlink: connection.downlink || null,
      rtt: connection.rtt || null
    }
  }, [])

  /**
   * Map effective connection type to our enum
   */
  const mapEffectiveType = (effectiveType: string): ConnectionType => {
    switch (effectiveType) {
      case '4g':
        return ConnectionType.CELLULAR_4G
      case '3g':
        return ConnectionType.CELLULAR_3G
      case '2g':
        return ConnectionType.CELLULAR_2G
      case 'slow-2g':
        return ConnectionType.CELLULAR_SLOW
      default:
        return ConnectionType.UNKNOWN
    }
  }

  /**
   * Calculate network quality based on metrics
   */
  const calculateQuality = useCallback((
    isOnline: boolean,
    downlink: number | null,
    rtt: number | null,
    effectiveConnection: ConnectionType
  ): NetworkQuality => {
    if (!isOnline) {
      return NetworkQuality.OFFLINE
    }

    // Use effective connection type as primary indicator
    switch (effectiveConnection) {
      case ConnectionType.CELLULAR_4G:
      case ConnectionType.ETHERNET:
      case ConnectionType.WIFI:
        if (rtt !== null && rtt < 100 && downlink !== null && downlink > 10) {
          return NetworkQuality.EXCELLENT
        }
        return NetworkQuality.GOOD

      case ConnectionType.CELLULAR_3G:
        return NetworkQuality.FAIR

      case ConnectionType.CELLULAR_2G:
      case ConnectionType.CELLULAR_SLOW:
        return NetworkQuality.POOR

      default:
        // Fall back to metrics-based assessment
        if (rtt !== null && downlink !== null) {
          if (rtt < 100 && downlink > 10) return NetworkQuality.EXCELLENT
          if (rtt < 200 && downlink > 5) return NetworkQuality.GOOD
          if (rtt < 400 && downlink > 1) return NetworkQuality.FAIR
          return NetworkQuality.POOR
        }
        return NetworkQuality.GOOD // Default when metrics unavailable
    }
  }, [])

  /**
   * Perform network ping to verify connectivity
   */
  const performPing = useCallback(async (): Promise<boolean> => {
    try {
      const startTime = performance.now()
      const response = await fetch(pingUrl, {
        method: 'HEAD',
        cache: 'no-cache',
        mode: 'no-cors' // Allow cross-origin pings
      })
      const endTime = performance.now()

      // Update RTT based on ping
      const pingRtt = Math.round(endTime - startTime)
      setStatus(prev => ({
        ...prev,
        rtt: prev.rtt !== null ? Math.round((prev.rtt + pingRtt) / 2) : pingRtt
      }))

      return true
    } catch (error) {
      console.log('Network ping failed:', error)
      return false
    }
  }, [pingUrl])

  /**
   * Update network status
   */
  const updateStatus = useCallback(async (forceOnlineCheck = false) => {
    const isOnline = navigator.onLine
    const connectionInfo = getConnectionInfo()

    // Perform actual connectivity check if online or forced
    let actuallyOnline = isOnline
    if (isOnline && forceOnlineCheck) {
      actuallyOnline = await performPing()
    }

    const quality = calculateQuality(
      actuallyOnline,
      connectionInfo.downlink || null,
      connectionInfo.rtt || null,
      connectionInfo.effectiveConnection || ConnectionType.UNKNOWN
    )

    setStatus(prev => {
      const statusChanged = prev.isOnline !== actuallyOnline
      const qualityChanged = prev.quality !== quality

      // Handle notifications
      if (showNotifications) {
        if (statusChanged && notifyOnStatusChange) {
          if (actuallyOnline) {
            showSuccessRef.current?.(
              'Connection Restored',
              'You are back online!',
              { duration: 3000 }
            )
          } else {
            showWarningRef.current?.(
              'Connection Lost',
              'You are currently offline. Some features may be unavailable.',
              { persistent: true }
            )
          }
        }

        if (qualityChanged && notifyOnQualityChange && actuallyOnline) {
          const qualityImproved = getQualityScore(quality) > getQualityScore(prev.quality)

          if (qualityImproved && quality === NetworkQuality.EXCELLENT) {
            showInfoRef.current?.(
              'Network Quality',
              'Excellent connection quality detected',
              { duration: 2000 }
            )
          } else if (!qualityImproved && quality === NetworkQuality.POOR) {
            showWarningRef.current?.(
              'Poor Connection',
              'Network quality is degraded. Performance may be affected.',
              { duration: 5000 }
            )
          }
        }
      }

      return {
        ...prev,
        ...connectionInfo,
        isOnline: actuallyOnline,
        quality,
        lastOnline: actuallyOnline && !prev.isOnline ? new Date() : prev.lastOnline,
        lastOffline: !actuallyOnline && prev.isOnline ? new Date() : prev.lastOffline,
        reconnectAttempts: actuallyOnline ? 0 : prev.reconnectAttempts
      }
    })
  }, [
    getConnectionInfo,
    calculateQuality,
    performPing,
    showNotifications,
    notifyOnStatusChange,
    notifyOnQualityChange
  ])

  /**
   * Get quality score for comparison
   */
  const getQualityScore = (quality: NetworkQuality): number => {
    switch (quality) {
      case NetworkQuality.EXCELLENT: return 4
      case NetworkQuality.GOOD: return 3
      case NetworkQuality.FAIR: return 2
      case NetworkQuality.POOR: return 1
      case NetworkQuality.OFFLINE: return 0
    }
  }

  /**
   * Handle automatic reconnection attempts
   */
  const attemptReconnection = useCallback(async () => {
    if (!autoReconnect || isReconnectingRef.current) {
      return
    }

    const currentStatus = status
    if (currentStatus.isOnline || currentStatus.reconnectAttempts >= maxReconnectAttempts) {
      return
    }

    isReconnectingRef.current = true

    console.log(`Attempting reconnection (${currentStatus.reconnectAttempts + 1}/${maxReconnectAttempts})`)

    // Check if we're actually back online
    const isOnline = await performPing()

    if (isOnline) {
      console.log('Reconnection successful!')
      updateStatus(true)
    } else {
      // Increment reconnect attempts
      setStatus(prev => ({
        ...prev,
        reconnectAttempts: prev.reconnectAttempts + 1
      }))

      // Schedule next reconnection attempt with exponential backoff
      if (currentStatus.reconnectAttempts + 1 < maxReconnectAttempts) {
        const delay = reconnectDelay * Math.pow(2, currentStatus.reconnectAttempts)
        console.log(`Next reconnection attempt in ${delay / 1000}s`)

        reconnectTimeoutRef.current = setTimeout(() => {
          isReconnectingRef.current = false
          attemptReconnection()
        }, delay)
      }
    }

    isReconnectingRef.current = false
  }, [
    autoReconnect,
    maxReconnectAttempts,
    performPing,
    updateStatus,
    reconnectDelay,
    status
  ])

  /**
   * Force a network status check
   */
  const checkNetworkStatus = useCallback(() => {
    updateStatus(true)
  }, [updateStatus])

  /**
   * Reset reconnection attempts
   */
  const resetReconnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    isReconnectingRef.current = false
    setStatus(prev => ({
      ...prev,
      reconnectAttempts: 0
    }))
  }, [])

  // Set up event listeners
  useEffect(() => {
    // Initial status update
    updateStatusRef.current?.()

    // Online/offline event handlers
    const handleOnline = () => {
      console.log('Browser reports online status')
      resetReconnectionRef.current?.()
      updateStatusRef.current?.(true)
    }

    const handleOffline = () => {
      console.log('Browser reports offline status')
      updateStatusRef.current?.()
      if (autoReconnect) {
        setTimeout(() => attemptReconnectionRef.current?.(), reconnectDelay)
      }
    }

    // Connection change handler
    const handleConnectionChange = () => {
      console.log('Network connection changed')
      updateStatusRef.current?.()
    }

    // Add event listeners
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Network Information API listeners
    if ('connection' in navigator) {
      const connection = (navigator as any).connection
      connection.addEventListener('change', handleConnectionChange)
    }

    // Set up periodic ping
    if (pingInterval > 0) {
      pingIntervalRef.current = setInterval(() => {
        if (navigator.onLine) {
          performPingRef.current?.()
        }
      }, pingInterval)
    }

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)

      if ('connection' in navigator) {
        const connection = (navigator as any).connection
        connection.removeEventListener('change', handleConnectionChange)
      }

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [autoReconnect, reconnectDelay, pingInterval])

  return {
    ...status,
    checkNetworkStatus,
    resetReconnection
  }
}

/**
 * Convenience hook for simple online/offline status
 */
export function useIsOnline(): boolean {
  const { isOnline } = useNetworkStatus({ showNotifications: false })
  return isOnline
}

/**
 * Hook for monitoring network quality changes
 */
export function useNetworkQuality(
  onQualityChange?: (quality: NetworkQuality, prevQuality: NetworkQuality) => void
): NetworkQuality {
  const { quality } = useNetworkStatus()
  const prevQualityRef = useRef(quality)

  useEffect(() => {
    if (quality !== prevQualityRef.current) {
      onQualityChange?.(quality, prevQualityRef.current)
      prevQualityRef.current = quality
    }
  }, [quality, onQualityChange])

  return quality
}
