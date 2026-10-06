/**
 * useCSRF Hook
 * 
 * React hook for handling CSRF protection in client-side components
 * Provides token management and automatic injection into requests
 */

'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';

export interface UseCSRFReturn {
  token: string | null;
  loading: boolean;
  error: string | null;
  refreshToken: () => Promise<void>;
  addToHeaders: (headers?: HeadersInit) => HeadersInit;
  addToFormData: (formData: FormData) => FormData;
}

/**
 * Custom hook for CSRF protection
 */
export function useCSRF(): UseCSRFReturn {
  const { userId, orgId } = useAuth();
  const query = useQuery({
    queryKey: ['csrf-token', userId, orgId],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/v1/csrf', { credentials: 'include', signal });
      if (!response.ok) throw new Error(`CSRF unavailable (${response.status})`);
      const data = await response.json();
      if (!data.token) throw new Error('No CSRF token received');
      return data.token as string;
    },
    refetchInterval: 55 * 60 * 1000, gcTime: 0, retry: 1,
  });
  const token = query.data ?? null;
  const loading = query.isFetching;
  const error = query.error?.message ?? null;
  const refreshToken = useCallback(async () => { await query.refetch(); }, [query.refetch]);

  /**
   * Add CSRF token to request headers
   */
  const addToHeaders = useCallback((headers: HeadersInit = {}): HeadersInit => {
    if (!token) {
      // Don't warn - CSRF may be temporarily disabled
      return headers;
    }

    const newHeaders = new Headers(headers);
    newHeaders.set('x-csrf-token', token);
    
    return newHeaders;
  }, [token]);

  /**
   * Add CSRF token to FormData
   */
  const addToFormData = useCallback((formData: FormData): FormData => {
    if (!token) {
      // Don't warn - CSRF may be temporarily disabled
      return formData;
    }

    formData.append('_csrf', token);
    return formData;
  }, [token]);

  return {
    token,
    loading,
    error,
    refreshToken,
    addToHeaders,
    addToFormData
  };
}

/**
 * Higher-order function to wrap fetch with CSRF protection
 */
export function createCSRFProtectedFetch(csrfToken: string) {
  return async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    headers.set('x-csrf-token', csrfToken);

    return fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });
  };
}

/**
 * Utility hook for form submissions with CSRF protection
 */
export function useCSRFForm() {
  const { token, loading, error, addToHeaders, addToFormData } = useCSRF();

  const submitForm = useCallback(async (
    url: string,
    formData: FormData,
    options: Omit<RequestInit, 'body' | 'method'> = {}
  ) => {
    if (!token) {
      throw new Error('CSRF token not available');
    }

    const protectedFormData = addToFormData(formData);
    const protectedHeaders = addToHeaders(options.headers);

    return fetch(url, {
      ...options,
      method: 'POST',
      body: protectedFormData,
      headers: protectedHeaders,
      credentials: 'include'
    });
  }, [token, addToHeaders, addToFormData]);

  const submitJSON = useCallback(async (
    url: string,
    data: any,
    options: Omit<RequestInit, 'body' | 'method'> = {}
  ) => {
    if (!token) {
      throw new Error('CSRF token not available');
    }

    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    const protectedHeaders = addToHeaders(headers);

    return fetch(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
      headers: protectedHeaders,
      credentials: 'include'
    });
  }, [token, addToHeaders]);

  return {
    token,
    loading,
    error,
    submitForm,
    submitJSON
  };
}