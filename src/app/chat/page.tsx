'use client';

import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { CleanAIChat } from '@/components/ai/clean-ai-chat';
import type { Citation } from '@/components/ai/clean-ai-chat';
import { CitationsPanel } from '@/components/chat/citations-panel';
import { DocumentChatToggle } from '@/components/chat/document-chat-toggle';
import { DocumentScopeSelector } from '@/components/chat/document-scope-selector';
import { DonationBanner } from '@/components/donation/donation-banner';
import { useAuth } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { ChatState, DEFAULT_GENERAL_STATE } from '@/types/chat';

export default function ChatPage() {
  const { orgId, userId, isSignedIn } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);

  // Document chat state
  const [chatState, setChatState] = useState<ChatState>(DEFAULT_GENERAL_STATE);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [availableDocuments, setAvailableDocuments] = useState<Array<{id: string, name: string, folderId?: string, createdAt: string}>>([]);
  const [availableFolders, setAvailableFolders] = useState<Array<{id: string, name: string}>>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [donationBannerVisible, setDonationBannerVisible] = useState(true);

  // Set hydration state
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Get organization ID via user sync
  useEffect(() => {
    const fetchOrgId = async () => {
      if (!userId || !isSignedIn) return;

      try {
        const userResponse = await fetch('/api/v1/user/sync', { method: 'POST' });
        const userData = await userResponse.json();

        if (userData.success && userData.data?.organizationId) {
          setOrganizationId(userData.data.organizationId);
        }
      } catch (error) {
        console.error('Failed to fetch organization ID:', error);
      }
    };

    fetchOrgId();
  }, [userId, isSignedIn]);

  // Load documents and folders when organization ID is available
  useEffect(() => {
    const loadDocumentsAndFolders = async () => {
      if (!organizationId || !isSignedIn) return;

      setDocumentsLoading(true);
      try {
        // Load documents and folders in parallel
        const [docsResponse, foldersResponse] = await Promise.all([
          fetch('/api/v1/documents'),
          fetch('/api/v1/folders')
        ]);

        if (docsResponse.ok) {
          const docsData = await docsResponse.json();
          if (docsData.success && docsData.documents) {
            setAvailableDocuments(docsData.documents.map((doc: any) => ({
              id: doc.id,
              name: doc.name,
              folderId: doc.folderId
            })));
          }
        }

        if (foldersResponse.ok) {
          const foldersData = await foldersResponse.json();
          if (foldersData.success && foldersData.folders) {
            setAvailableFolders(foldersData.folders.map((folder: any) => ({
              id: folder.id,
              name: folder.name
            })));
          }
        }
      } catch (error) {
        console.error('Failed to load documents and folders:', error);
      } finally {
        setDocumentsLoading(false);
      }
    };

    loadDocumentsAndFolders();
  }, [organizationId, isSignedIn]);

  // Handle document chat toggle
  const handleDocumentChatToggle = (enabled: boolean) => {
    if (enabled && availableDocuments.length > 0) {
      // Switch to document mode - load OpenAI provider
      setChatState({
        documentChatEnabled: true,
        documentScope: {
          mode: 'all-documents',
          documentCount: availableDocuments.length
        },
        provider: 'openai'
      });
    } else {
      // Switch back to general chat mode
      setChatState(DEFAULT_GENERAL_STATE);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Donation Banner */}
      <DonationBanner onVisibilityChange={setDonationBannerVisible} />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          showNavigation={true}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <Header
            onMobileMenuToggle={() => setSidebarOpen(!sidebarOpen)}
            showNavigation={true}
            donationBannerVisible={donationBannerVisible}
          />

          {/* Chat content with settings panel */}
          <main className="flex-1 overflow-hidden flex" style={{ height: 'calc(100vh - 8rem)' }}>
          {/* Chat area */}
          <div className="flex-1 flex flex-col">
            {/* Chat header with document chat controls and settings */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 md:p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="flex items-center gap-2 md:gap-4 min-w-0">
                <h1 className="text-base md:text-lg font-semibold truncate">
                  {chatState.documentChatEnabled ? 'Document Chat' : 'AI Chat'}
                </h1>

                {/* Document Chat Toggle */}
                {isSignedIn && isHydrated && (
                  <div className="hidden sm:block">
                    <DocumentChatToggle
                      enabled={chatState.documentChatEnabled}
                      onToggle={handleDocumentChatToggle}
                      isLoading={documentsLoading}
                      documentCount={availableDocuments.length}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Mobile Document Chat Toggle */}
                {isSignedIn && isHydrated && (
                  <div className="sm:hidden flex-1">
                    <DocumentChatToggle
                      enabled={chatState.documentChatEnabled}
                      onToggle={handleDocumentChatToggle}
                      isLoading={documentsLoading}
                      documentCount={availableDocuments.length}
                    />
                  </div>
                )}

                {/* Document Scope Selector - only show when document chat is enabled */}
                {isHydrated && chatState.documentChatEnabled && chatState.documentScope && (
                  <div className="flex-1 sm:flex-initial min-w-0">
                    <DocumentScopeSelector
                      currentScope={chatState.documentScope}
                      onScopeChange={(scope) => setChatState(prev => ({
                        ...prev,
                        documentScope: scope
                      }))}
                      availableDocuments={availableDocuments}
                      availableFolders={availableFolders}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Chat component */}
            <div className="flex-1 overflow-hidden">
              <CleanAIChat
                organizationId={organizationId || orgId || userId || 'demo'}
                className="h-full w-full"
                chatState={chatState}
                onCitationsUpdate={(citations) => {
                  setActiveCitations(citations);
                  setCitationsOpen(citations.length > 0);
                }}
              />
            </div>
          </div>

          {/* Citations panel */}
          <CitationsPanel
            isOpen={citationsOpen}
            onClose={() => setCitationsOpen(false)}
            citations={activeCitations}
          />
        </main>
        </div>
      </div>
    </div>
  );
}
