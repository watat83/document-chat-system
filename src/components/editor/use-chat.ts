'use client';
import { useChat as useBaseChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { usePluginOption } from 'platejs/react';
import { aiChatPlugin } from '@/components/editor/plugins/ai-kit';
const transport = new DefaultChatTransport({ api: '/api/ai/command' });
export const useChat = () => {
  const options = usePluginOption(aiChatPlugin, 'chatOptions');
  return useBaseChat({ ...options, id: 'editor', transport });
};
