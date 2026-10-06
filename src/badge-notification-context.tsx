'use client'

import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useNotificationStream } from '@/hooks/use-notification-stream'

export interface BadgeNotification {
  id: string
  type: 'OPPORTUNITY' | 'SYSTEM' | 'UPDATE' | 'WARNING' | 'SUCCESS' | 'BILLING' | 'TEAM'
  category: 'NEW_OPPORTUNITY' | 'MATCH_SCORE' | 'SYSTEM_UPDATE' | 'BILLING' | 'PROFILE' | 'TEAM' | 'DEADLINE' | 'GENERAL'
  title: string
  message: string
  timestamp: Date
  read: boolean
  actionUrl?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  metadata?: Record<string, unknown>
  expiresAt?: Date
}

interface BadgeNotificationState {
  notifications: BadgeNotification[]
  unreadCount: number
  loading: boolean
  error: string | null
}

type BadgeNotificationAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_NOTIFICATIONS'; payload: { notifications: BadgeNotification[]; unreadCount: number } }
  | { type: 'ADD_NOTIFICATION'; payload: BadgeNotification }
  | { type: 'MARK_AS_READ'; payload: string }
  | { type: 'MARK_ALL_AS_READ' }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'CLEAR_ALL_NOTIFICATIONS' }

const initialState: BadgeNotificationState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
}

function badgeNotificationReducer(state: BadgeNotificationState, action: BadgeNotificationAction): BadgeNotificationState {
  switch (action.type) {
    case 'SET_LOADING': {
      return {
        ...state,
        loading: action.payload
      }
    }
    
    case 'SET_ERROR': {
      return {
        ...state,
        error: action.payload,
        loading: false
      }
    }
    
    case 'SET_NOTIFICATIONS': {
      return {
        ...state,
        notifications: action.payload.notifications,
        unreadCount: action.payload.unreadCount,
        loading: false,
        error: null
      }
    }
    
    case 'ADD_NOTIFICATION': {
      return {
        ...state,
        notifications: [action.payload, ...state.notifications],
        unreadCount: action.payload.read ? state.unreadCount : state.unreadCount + 1
      }
    }
    
    case 'MARK_AS_READ': {
      const notifications = state.notifications.map(notification =>
        notification.id === action.payload
          ? { ...notification, read: true }
          : notification
      )
      
      const unreadCount = notifications.filter(n => !n.read).length
      
      return {
        ...state,
        notifications,
        unreadCount
      }
    }
    
    case 'MARK_ALL_AS_READ': {
      return {
        ...state,
        notifications: state.notifications.map(n => ({ ...n, read: true })),
        unreadCount: 0
      }
    }
    
    case 'REMOVE_NOTIFICATION': {
      const notifications = state.notifications.filter(n => n.id !== action.payload)
      const unreadCount = notifications.filter(n => !n.read).length
      
      return {
        ...state,
        notifications,
        unreadCount
      }
    }
    
    case 'CLEAR_ALL_NOTIFICATIONS': {
      return {
        ...state,
        notifications: [],
        unreadCount: 0
      }
    }
    
    default:
      return state
  }
}

interface BadgeNotificationContextType {
  notifications: BadgeNotification[]
  unreadCount: number
  loading: boolean
  error: string | null
  refreshNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  removeNotification: (id: string) => Promise<void>
  clearAllNotifications: () => void
  isConnected: boolean
  isConnecting: boolean
}

const BadgeNotificationContext = createContext<BadgeNotificationContextType | undefined>(undefined)

export function BadgeNotificationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(badgeNotificationReducer, initialState)
  const { isSignedIn, getToken, isLoaded } = useAuth()
  const [retryCount, setRetryCount] = useState(0)
  const [fallbackMode, setFallbackMode] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isPageVisible, setIsPageVisible] = useState(true)
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  
  // API helper function
  const apiCall = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    if (!isSignedIn) {
      console.log('API call skipped: user not signed in')
      return null
    }
    
    let timeoutId: NodeJS.Timeout | null = null
    const controller = new AbortController()
    
    try {
      const token = await getToken()
      if (!token) {
        console.log('API call failed: no token available')
        return null
      }
      
      console.log(`Making API call to ${endpoint} with auth token`)
      
      // Set up timeout with better error message
      timeoutId = setTimeout(() => {
        console.log(`API call to ${endpoint} timed out after 15 seconds`)
        if (!controller.signal.aborted) {
          controller.abort()
        }
      }, 15000) // Increased to 15 seconds for better reliability
      
      const response = await fetch(endpoint, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      })
      
      // Clear timeout on successful response
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      
      return response
    } catch (error) {
      // Only log errors that aren't timeout-related
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`API call to ${endpoint} was aborted`)
        return null // Return null for aborted requests instead of throwing
      }
      
      console.error('Error in API call:', error)
      
      // Check specific error types
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        console.error('Network error - check if development server is running')
        // Don't throw the error during development, just log it
        if (process.env.NODE_ENV === 'development') {
          console.log('Skipping network error during development')
          return null
        }
        throw new Error('Network connection failed. Please check if the server is running.')
      }
      
      throw error
    } finally {
      // Always clear the timeout in the finally block
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [isSignedIn, getToken])

  // Transform API notification to local format
  const transformNotification = (apiNotification: any): BadgeNotification => ({
    id: apiNotification.id,
    type: apiNotification.type,
    category: apiNotification.category,
    title: apiNotification.title,
    message: apiNotification.message,
    timestamp: new Date(apiNotification.createdAt),
    read: apiNotification.isRead,
    actionUrl: apiNotification.actionUrl,
    priority: apiNotification.priority,
    metadata: apiNotification.metadata,
    expiresAt: apiNotification.expiresAt ? new Date(apiNotification.expiresAt) : undefined,
  })
  
  // Fetch notifications from API
  const refreshNotifications = useCallback(async function refreshNotifications() {
    if (!isLoaded || !isSignedIn) {
      console.log('User not loaded or not signed in, skipping notification fetch')
      dispatch({ type: 'SET_ERROR', payload: null }) // Clear any auth errors
      return
    }
    
    // Prevent multiple simultaneous requests
    if (isRefreshing) {
      console.log('Already refreshing notifications, skipping duplicate request')
      return
    }
    
    // Test if we can get a token before making the API call
    try {
      const testToken = await getToken()
      if (!testToken) {
        console.log('No auth token available, skipping notification fetch')
        dispatch({ type: 'SET_ERROR', payload: null })
        return
      }
    } catch (tokenError) {
      console.log('Failed to get auth token, skipping notification fetch:', tokenError)
      dispatch({ type: 'SET_ERROR', payload: null })
      return
    }
    
    try {
      setIsRefreshing(true)
      dispatch({ type: 'SET_LOADING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: null }) // Clear previous errors
      
      const response = await apiCall('/api/v1/notifications?limit=50')
      if (!response) {
        console.log('No response from API (user not authenticated or request aborted)')
        // Don't set error for aborted requests, just return silently
        return
      }
      
      if (!response.ok) {
        if (response.status === 401) {
          console.log('Authentication failed, user needs to sign in')
          dispatch({ type: 'SET_ERROR', payload: 'Please sign in to view notifications' })
          return
        }
        
        if (response.status >= 500) {
          console.error('Server error:', response.status, response.statusText)
          dispatch({ type: 'SET_ERROR', payload: 'Server error. Please try again later.' })
          return
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const response_data = await response.json()
      
      // Handle the API response structure {success: true, data: {...}}
      const data = response_data.success ? response_data.data : response_data
      
      // Ensure data has the expected structure
      if (!data || !Array.isArray(data.notifications)) {
        console.error('Invalid API response format:', response_data)
        dispatch({ type: 'SET_ERROR', payload: 'Invalid response format from server' })
        return
      }
      
      const transformedNotifications = data.notifications.map(transformNotification)
      
      dispatch({
        type: 'SET_NOTIFICATIONS',
        payload: {
          notifications: transformedNotifications,
          unreadCount: data.unreadCount,
        }
      })
      
      console.log(`Loaded ${transformedNotifications.length} notifications, ${data.unreadCount} unread`)
      
      // Update last fetch time
      setLastFetchTime(new Date())
      
      // Reset retry count and fallback mode on successful fetch
      if (retryCount > 0) {
        setRetryCount(0)
      }
      if (fallbackMode) {
        setFallbackMode(false)
        console.log('API recovered, exiting fallback mode')
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
      
      // In development mode, don't show errors for network issues - just log and continue
      if (process.env.NODE_ENV === 'development') {
        console.log('Notification fetch failed during development, continuing without error display')
        dispatch({ type: 'SET_ERROR', payload: null })
        return
      }
      
      let errorMessage = 'Failed to load notifications'
      if (error instanceof Error) {
        if (error.message.includes('Network connection failed')) {
          errorMessage = 'Connection failed. Please check your internet connection and try again.'
        } else if (error.message.includes('Request timed out')) {
          errorMessage = 'Request timed out. Please try again.'
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Unable to connect to the server. Please try again later.'
        } else if (error.message.includes('Authentication')) {
          // Don't show auth errors as they're usually temporary during sign-in
          console.log('Authentication error during notification fetch, will retry when user is signed in')
          dispatch({ type: 'SET_ERROR', payload: null })
          return
        }
      }
      
      dispatch({ type: 'SET_ERROR', payload: errorMessage })
      
      // Implement retry logic with exponential backoff
      if (retryCount < 3 && !fallbackMode) {
        setRetryCount(prev => prev + 1)
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000) // Max 10 seconds
        
        console.log(`Retrying notification fetch in ${delay}ms (attempt ${retryCount + 1}/3)`)
        setTimeout(() => {
          refreshNotifications()
        }, delay)
      } else if (retryCount >= 3) {
        console.log('Max retries reached, entering fallback mode')
        setFallbackMode(true)
        dispatch({ 
          type: 'SET_ERROR', 
          payload: 'Notifications temporarily unavailable. The app will continue to work normally.' 
        })
      }
    } finally {
      setIsRefreshing(false)
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [isSignedIn, apiCall, retryCount, fallbackMode])
  
  // Mark notification as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      const response = await apiCall(`/api/v1/notifications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isRead: true }),
      })
      
      if (response?.ok) {
        dispatch({ type: 'MARK_AS_READ', payload: id })
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }, [apiCall])
  
  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      const response = await apiCall('/api/v1/notifications?action=mark-all-read', {
        method: 'PATCH',
      })
      
      if (response?.ok) {
        dispatch({ type: 'MARK_ALL_AS_READ' })
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }, [apiCall])
  
  // Remove notification
  const removeNotification = useCallback(async (id: string) => {
    try {
      const response = await apiCall(`/api/v1/notifications/${id}`, {
        method: 'DELETE',
      })
      
      if (response?.ok) {
        dispatch({ type: 'REMOVE_NOTIFICATION', payload: id })
      }
    } catch (error) {
      console.error('Error removing notification:', error)
    }
  }, [apiCall])
  
  // Clear all notifications (local only)
  const clearAllNotifications = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_NOTIFICATIONS' })
  }, [])
  
  // Handle real-time notifications
  const handleRealTimeNotification = useCallback((notification: any) => {
    const transformedNotification = transformNotification(notification)
    dispatch({ type: 'ADD_NOTIFICATION', payload: transformedNotification })
  }, [])

  const handleSystemNotification = useCallback((notification: any) => {
    const transformedNotification = transformNotification(notification)
    dispatch({ type: 'ADD_NOTIFICATION', payload: transformedNotification })
  }, [])

  // Initialize SSE connection - disabled to prevent loops
  const { isConnected, isConnecting } = useNotificationStream({
    onNotification: handleRealTimeNotification,
    onSystemMessage: handleSystemNotification,
    onConnect: () => {
      console.log('Real-time notifications connected')
      // Reset retry count when SSE connects successfully
      setRetryCount(0)
    },
    onDisconnect: () => {
      console.log('Real-time notifications disconnected')
    },
    onError: (error) => {
      console.error('Real-time notification error:', error)
      // Don't retry SSE if we're already in fallback mode
      if (fallbackMode) {
        console.log('Already in fallback mode, not retrying SSE')
      }
    },
    autoReconnect: false, // Disabled to prevent connection loops
    reconnectDelay: 10000, // Increased delay to reduce load
  })

  // Track page visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden)
      console.log('Page visibility changed:', !document.hidden ? 'visible' : 'hidden')
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])
  
  // Load notifications on mount and when user signs in
  useEffect(() => {
    if (isLoaded && isSignedIn && isPageVisible) {
      // Skip notifications on showcase/demo pages to prevent unnecessary API calls
      if (typeof window !== 'undefined' && window.location.pathname.includes('/components-showcase')) {
        console.log('Skipping badge notifications on showcase page')
        return
      }
      
      // Skip notifications during development on AI-related pages
      if (typeof window !== 'undefined' && window.location.pathname.includes('/chat')) {
        console.log('Skipping badge notifications on chat page during development')
        return
      }
      
      // Only fetch if we haven't fetched recently (within 30 seconds)
      if (!lastFetchTime || Date.now() - lastFetchTime.getTime() > 30000) {
        refreshNotifications()
      }
    }
  }, [isLoaded, isSignedIn, isPageVisible]) // refreshNotifications is memoized and stable
  
  // Reduced polling frequency with page visibility check
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !isPageVisible) return
    
    // Skip polling on showcase pages
    if (typeof window !== 'undefined' && window.location.pathname.includes('/components-showcase')) {
      return
    }
    
    // Skip polling on chat pages during development
    if (typeof window !== 'undefined' && window.location.pathname.includes('/chat')) {
      return
    }
    
    // Only poll if not connected to SSE and not in active refresh
    if (isConnected || isRefreshing) {
      console.log('Skipping polling: SSE connected or refresh in progress')
      return
    }
    
    const pollInterval = fallbackMode ? 120000 : 60000 // 2 minutes in fallback, 1 minute normally
    console.log(`Setting up polling with ${pollInterval}ms interval`)
    
    const interval = setInterval(() => {
      if (!isRefreshing && isPageVisible) {
        console.log('Polling for notifications...')
        refreshNotifications()
      }
    }, pollInterval)
    
    return () => {
      console.log('Clearing polling interval')
      clearInterval(interval)
    }
  }, [isSignedIn, isConnected, fallbackMode, isPageVisible, isRefreshing]) // refreshNotifications is memoized and stable
  
  // Recovery mechanism - periodically try to exit fallback mode
  useEffect(() => {
    if (!fallbackMode || !isLoaded || !isSignedIn || !isPageVisible) return
    
    const recoveryInterval = setInterval(() => {
      if (!isRefreshing && isPageVisible) {
        console.log('Attempting to recover from fallback mode...')
        refreshNotifications()
      }
    }, 300000) // Try every 5 minutes
    
    return () => {
      console.log('Clearing recovery interval')
      clearInterval(recoveryInterval)
    }
  }, [fallbackMode, isSignedIn, isPageVisible, isRefreshing]) // refreshNotifications is memoized and stable
  
  const contextValue: BadgeNotificationContextType = {
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    loading: state.loading,
    error: state.error,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAllNotifications,
    isConnected,
    isConnecting
  }
  
  return (
    <BadgeNotificationContext.Provider value={contextValue}>
      {children}
    </BadgeNotificationContext.Provider>
  )
}

export function useBadgeNotifications() {
  const context = useContext(BadgeNotificationContext)
  if (context === undefined) {
    throw new Error('useBadgeNotifications must be used within a BadgeNotificationProvider')
  }
  return context
}