import { getSupabaseUrl } from '@/supabase/client';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
};

export type ChatSession = {
  philosopherId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export async function requestPhilosopherChat(
  philosopherId: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: {
    model?: string;
    signal?: AbortSignal;
  }
) {
  const { signal } = options ?? {};

  const response = await fetch(
    `${getSupabaseUrl()}/functions/v1/philosopher-chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        philosopherId, 
        messages, 
        stream: true 
      }),
      signal,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: '请求失败' }));
    throw new Error(errorData.error || `请求失败: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        if (payload === '[DONE]') return fullText;

        try {
          const json = JSON.parse(payload);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch {
          // 忽略非法 JSON 行
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return fullText;
    throw err;
  }

  return fullText;
}

// 本地存储聊天历史
const STORAGE_KEY = 'philosopher-chat-history';

export function saveChatSession(philosopherId: string, messages: ChatMessage[]) {
  const sessions = getChatSessions();
  const existingIndex = sessions.findIndex(s => s.philosopherId === philosopherId);
  
  const session: ChatSession = {
    philosopherId,
    messages,
    createdAt: existingIndex >= 0 ? sessions[existingIndex].createdAt : Date.now(),
    updatedAt: Date.now(),
  };

  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.push(session);
  }

  // 只保留最近20个会话
  const trimmedSessions = sessions.slice(-20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedSessions));
}

export function getChatSessions(): ChatSession[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getChatSession(philosopherId: string): ChatSession | null {
  const sessions = getChatSessions();
  return sessions.find(s => s.philosopherId === philosopherId) || null;
}

export function clearChatSession(philosopherId: string) {
  const sessions = getChatSessions();
  const filtered = sessions.filter(s => s.philosopherId !== philosopherId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function clearAllChatSessions() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportChatSession(philosopherId: string, philosopherName: string): string {
  const session = getChatSession(philosopherId);
  if (!session) return '';

  const lines = [
    `与${philosopherName}的对话记录`,
    `导出时间: ${new Date().toLocaleString()}`,
    '='.repeat(50),
    '',
  ];

  session.messages.forEach((msg) => {
    const role = msg.role === 'user' ? '你' : philosopherName;
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
    lines.push(`${role} (${time}):`);
    lines.push(msg.content);
    lines.push('');
  });

  return lines.join('\n');
}
