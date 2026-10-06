'use client';
import { useEffect, useRef, useState } from 'react';
interface SavedMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: Date | string; metadata?: Record<string, unknown> }
export function useConversationHistory<T extends SavedMessage>(userId: string | null | undefined, organizationId: string | undefined, messages: T[], setMessages: (messages: T[]) => void) {
  const identity = `${userId || ''}:${organizationId || ''}`;
  const [loaded, setLoaded] = useState<{ identity: string; error: string; ready: boolean }>({ identity: '', error: '', ready: false });
  const ready = loaded.identity === identity && loaded.ready;
  const error = loaded.identity === identity ? loaded.error : '';
  const setError = (message: string) => setLoaded(previous => ({ ...previous, error: message }));
  const state = useRef<{ id?: string; revision: number; saving: boolean; blocked: boolean; identity: string }>({ revision: 0, saving: false, blocked: false, identity: '' });
  const latest = useRef(messages);
  useEffect(() => { latest.current = messages; }, [messages]);
  useEffect(() => {
    const identity = `${userId || ''}:${organizationId || ''}`;
    state.current = { revision: 0, saving: false, blocked: false, identity };
    if (!userId || !organizationId) return;
    const controller = new AbortController();
    void fetch('/api/v1/conversations?latest=true', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Chat history unavailable. Your new messages will remain in this tab.');
      const { conversation } = await response.json();
      if (controller.signal.aborted) return;
      if (conversation) {
        state.current.id = conversation.id; state.current.revision = conversation.revision;
        setMessages(conversation.messages.map((m: T) => ({ ...m, timestamp: new Date(m.timestamp) })));
      } else setMessages([]);
      setLoaded({ identity, error: '', ready: true });
    }).catch(e => { if (!controller.signal.aborted) { setMessages([]); setLoaded({ identity, error: e.message, ready: false }); state.current.blocked = true; } });
    return () => controller.abort();
  }, [userId, organizationId, setMessages]);
  useEffect(() => {
    if (!ready || !messages.length) return;
    const timer = setTimeout(async () => {
      const current = state.current;
      if (current.saving || current.blocked) return;
      current.saving = true;
      try {
      do {
      const snapshot = latest.current;
      const serialized = snapshot.map(({ id, role, content, timestamp, metadata }) => ({ id, role, content, timestamp: new Date(timestamp).toISOString(), metadata }));
        const response = await fetch(current.id ? `/api/v1/conversations/${current.id}` : '/api/v1/conversations', {
          method: current.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: serialized, revision: current.revision, title: snapshot.find(m => m.role === 'user')?.content.slice(0, 100) || 'Conversation' }),
        });
        if (!response.ok) { current.blocked = true; throw new Error(response.status === 409 ? 'History changed in another tab. Reload before continuing.' : 'Chat history could not be saved. Keep this tab open.'); }
        const { conversation } = await response.json();
        if (state.current !== current) return;
        current.id = conversation.id; current.revision = conversation.revision; setError('');
        if (latest.current === snapshot) break;
      } while (state.current === current && !current.blocked);
      } catch (e) { current.blocked = true; if (state.current === current) setError(e instanceof Error ? e.message : 'History could not be saved'); }
      finally { current.saving = false; }
    }, 600);
    return () => clearTimeout(timer);
  }, [messages, ready]);
  return { error, ready };
}
