import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  Send, 
  Trash2, 
  Download, 
  MessageCircle, 
  Loader2,
  History,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Bot,
  User,
  Volume2,
  Headphones,
  Mic,
  MicOff,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRecitationUrl, getVoiceProfile, type Philosopher } from '@/data/philosophers';
import { useSpeech, isRecognitionSupported, startDictation as startDictationFn } from '@/lib/speech';
import { 
  requestPhilosopherChat, 
  ChatMessage,
  saveChatSession,
  getChatSession,
  clearChatSession,
  exportChatSession,
} from '@/services/philosopherAI';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ScrollArea,
} from '@/components/ui/scroll-area';
import { TypewriterText } from './TypewriterText';
import { PhilosopherPersonaCard } from './PhilosopherPersonaCard';

interface PhilosopherChatProps {
  philosopher: Philosopher;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PhilosopherChat({ philosopher, isOpen, onOpenChange }: PhilosopherChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // —— 语音：AI 朗读(TTS) / 原声 / 语音输入 ——
  const speech = useSpeech();
  const [listening, setListening] = useState(false);
  const dictationRef = useRef<{ stop: () => void } | null>(null);
  const recognitionSupported = isRecognitionSupported();

    // AI 朗读音色：条目显式配置 > 性格音色表 > 时代地域兜底
  // 让每位哲学家的朗读都有性格（老子低沉缓慢、尼采激越奔放…），纯参数不涉及真实人声
  const voiceOpts = getVoiceProfile(philosopher);

  const handleRead = (text: string) => {
    if (speech.speaking) {
      speech.stop();
    } else {
      speech.read(text, voiceOpts);
    }
  };

  /** 听原声：哲学家本人的真实录音（仅现代人物有，如毛泽东/周恩来） */
  const handleOriginal = (fallbackText: string) => {
    if (!philosopher.voice?.audio) return;
    if (speech.speaking) {
      speech.stop();
    } else {
      speech.playClip(philosopher.voice.audio, fallbackText, voiceOpts);
    }
  };

  /** 听原著：朗诵者朗读该哲学家的著作（非本人口吻；古代哲学家只有这一类） */
  const recitationUrl = getRecitationUrl(philosopher);

  const handleRecitation = (fallbackText: string) => {
    if (!recitationUrl) return;
    if (speech.speaking) {
      speech.stop();
    } else {
      speech.playClip(recitationUrl, fallbackText, voiceOpts);
    }
  };

  const stopDictation = useCallback(() => {
    dictationRef.current?.stop();
    dictationRef.current = null;
    setListening(false);
  }, []);

  const startDictation = useCallback(() => {
    if (listening) {
      stopDictation();
      return;
    }
    const ctrl = startDictationFn({
      lang: voiceOpts.lang || 'zh-CN',
      onResult: (text, isFinal) => {
        if (isFinal) {
          setInput((prev) => (prev ? prev + (prev.endsWith(' ') ? '' : ' ') : '') + text);
        }
      },
      onEnd: () => {
        dictationRef.current = null;
        setListening(false);
      },
      onError: () => {
        dictationRef.current = null;
        setListening(false);
      },
    });
    if (ctrl) {
      dictationRef.current = ctrl;
      setListening(true);
    }
  }, [listening, stopDictation, voiceOpts.lang]);

  // 开始新一轮回答时，停掉所有语音
  useEffect(() => {
    if (isLoading) speech.stop();
  }, [isLoading, speech]);

  // Load chat history when opened
  useEffect(() => {
    if (isOpen) {
      const session = getChatSession(philosopher.id);
      if (session) {
        setMessages(session.messages);
      } else {
        // Welcome message
        const welcomeMessage: ChatMessage = {
          role: 'assistant',
          content: getWelcomeMessage(philosopher.id),
          timestamp: Date.now(),
        };
        setMessages([welcomeMessage]);
      }
    }
  }, [isOpen, philosopher.id]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, streamingText]);

  // Save chat history when messages change
  useEffect(() => {
    if (messages.length > 0 && !isLoading) {
      saveChatSession(philosopher.id, messages);
    }
  }, [messages, philosopher.id, isLoading]);

  const getWelcomeMessage = (id: string): string => {
    const messages: Record<string, string> = {
      socrates: '你好，朋友。我是苏格拉底。让我们一同探讨真理，通过提问来发现智慧。你想讨论什么话题呢？',
      plato: '欢迎你，求知者。我是柏拉图。让我们一起追寻那永恒的理念，探索真理的世界。你有何疑问？',
      aristotle: '你好，我是亚里士多德。让我们用理性和观察来理解这个世界。你想探讨什么领域的问题？',
      confucius: '有朋自远方来，不亦乐乎。我是孔子。让我们谈谈仁义礼智信，探讨为人处世的道理。',
      kant: '你好，我是康德。让我们运用理性，批判地审视知识和道德。你有何哲学问题要讨论？',
      hegel: '欢迎你，我是黑格尔。让我们用辩证法来理解历史和精神的自我展开。你想探讨什么？',
      schopenhauer: '你好，我是叔本华。生命充满痛苦，但我们可以透过艺术和哲学获得暂时的解脱。你有何疑问？',
      nietzsche: '你好！我是尼采。让我们重估一切价值，肯定生命的力量！你想讨论什么话题？',
      marx: '你好，我是马克思。让我们用批判的眼光审视社会和历史的运动。你有何问题？',
      heidegger: '你好，我是海德格尔。让我们追问存在的意义，思考人的本真存在。你想探讨什么？',
      wittgenstein: '你好，我是维特根斯坦。让我们澄清语言的界限，思考可说与不可说之事。',
      camus: '你好，我是加缪。世界是荒诞的，但我们可以反抗并赋予生命以意义。你想讨论什么？',
      foucault: '你好，我是福柯。让我们分析权力、知识和话语的运作机制。你有何疑问？',
      mao: '你好！我是毛泽东。我们谈问题要从实际出发，实事求是。你想探讨什么？',
      zhou: '你好，我是周恩来。为人民服务，应当从大局出发。你有什么想交流的？',
    };
    return messages[id] || '你好，让我们开始一场哲学对话吧。';
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setStreamingText('');

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      let assistantContent = '';
      
      await requestPhilosopherChat(
        philosopher.id,
        [...messages, userMessage],
        (chunk) => {
          assistantContent += chunk;
          setStreamingText(assistantContent);
        },
        { signal: abortControllerRef.current.signal }
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingText('');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message || '对话出现错误，请重试');
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [input, isLoading, messages, philosopher.id]);

  const handleClear = () => {
    clearChatSession(philosopher.id);
    const welcomeMessage: ChatMessage = {
      role: 'assistant',
      content: getWelcomeMessage(philosopher.id),
      timestamp: Date.now(),
    };
    setMessages([welcomeMessage]);
    setError(null);
  };

  const handleExport = () => {
    const content = exportChatSession(philosopher.id, philosopher.name);
    if (!content) return;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `与${philosopher.name}的对话记录.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] overflow-hidden bg-card border-border/50 flex flex-col">
        <DialogHeader className="border-b border-border/50 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="relative">
              <img
                src={philosopher.portrait}
                alt={philosopher.name}
                className="w-12 h-12 rounded-full object-cover border-2 border-primary"
              />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                <Bot className="w-3 h-3 text-primary-foreground" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg text-white">与{philosopher.name}对话</span>
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs text-white/70">
                {philosopher.school[0]} · AI模拟对话
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleExport}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="导出对话"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={handleClear}
                className="p-2 rounded-lg hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
                title="清空对话"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* flex-1 + min-h-0：让消息区真正可滚动（缺 min-h-0 时滚轮会失效） */}
        <div className="flex flex-1 flex-col min-h-0">
          {/* 人格卡：展示学派 / 立场 / 一句话简介 */}
          <PhilosopherPersonaCard philosopher={philosopher} className="mb-3 shrink-0" />

          {/* Chat Messages */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 pr-4" scrollbarType="always">
            <div className="space-y-4 py-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    message.role === 'user' 
                      ? 'bg-primary/20' 
                      : 'bg-muted'
                  )}>
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-primary" />
                    ) : (
                      <img
                        src={philosopher.portrait}
                        alt={philosopher.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-3',
                      message.role === 'user'
                        ? 'bg-primary text-white'
                        : 'bg-muted text-foreground'
                    )}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-white/50">
                        {message.timestamp && new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                      {message.role === 'assistant' && message.content && (
                        <div className="flex items-center gap-0.5 ml-auto">
                          <button
                              onClick={() => handleRead(message.content)}
                              title={
                                speech.speaking
                                  ? '停止朗读'
                                  : `AI 朗读${voiceOpts.styleLabel ? `（${voiceOpts.styleLabel}）` : ''}`
                              }
                            className="p-1 rounded hover:bg-background/60 transition-colors text-white/55 hover:text-foreground"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                          {philosopher.voice?.audio && (
                            <button
                              onClick={() => handleOriginal(message.content)}
                              title="听原声（本人真实录音）"
                              className="p-1 rounded hover:bg-background/60 transition-colors text-white/55 hover:text-foreground"
                            >
                              <Headphones className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {recitationUrl && (
                            <button
                              onClick={() => handleRecitation(message.content)}
                              title="听原著（朗诵者朗读其著作，非本人口吻）"
                              className="p-1 rounded hover:bg-background/60 transition-colors text-white/55 hover:text-foreground"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Streaming Message */}
              {isLoading && streamingText && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0">
                    <img
                      src={philosopher.portrait}
                      alt={philosopher.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-muted text-foreground">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {streamingText}
                      <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
                    </p>
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {isLoading && !streamingText && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0">
                    <img
                      src={philosopher.portrait}
                      alt={philosopher.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted rounded-2xl">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">思考中...</span>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="flex justify-center">
                  <div className="px-4 py-2 bg-destructive/10 text-destructive rounded-lg text-sm">
                    {error}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t border-border/50 pt-4 mt-4 shrink-0">
            <div className="flex gap-2">
              {recognitionSupported && (
                <button
                  onClick={startDictation}
                  title={listening ? '停止聆听' : '语音输入（说给哲学家听）'}
                  className={cn(
                    'px-3 rounded-xl border border-border/50 transition-all flex items-center justify-center',
                    listening
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {listening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`向${philosopher.name}提问...`}
                  className="w-full px-4 py-3 pr-12 bg-muted/50 border border-border/50 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm min-h-[48px] max-h-[120px] text-white placeholder:text-white/60"
                  rows={1}
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all',
                    input.trim() && !isLoading
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
            {listening && (
              <p className="text-xs text-primary mt-2 text-center flex items-center justify-center gap-1">
                <MicOff className="w-3 h-3 animate-pulse" /> 聆听中…请对麦克风说出你的问题
              </p>
            )}
            <p className="text-xs text-white/50 mt-2 text-center">
              AI模拟对话，仅供学习和娱乐使用
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
