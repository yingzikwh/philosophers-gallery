/**
 * 语音工具模块：AI 朗读(TTS) + 语音输入(识别)
 * ------------------------------------------------------------
 * - TTS：基于浏览器原生 Web Speech API（SpeechSynthesis），无需后端、离线可用。
 *   用于"没有音频资料的哲学家"的 AI 朗读，也作为"原声缺失"时的兜底。
 * - 识别：基于 Web Speech API 的 SpeechRecognition，用于"语音输入(写)"。
 * 所有接口都对不支持的环境做了降级（不报错、返回 false / 隐藏按钮）。
 */

export interface SpeakOptions {
  lang?: string;
  pitch?: number;
  rate?: number;
  voiceName?: string;
}

/** 浏览器是否支持 TTS 朗读 */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 浏览器是否支持语音识别（语音输入） */
export function isRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
}

/** 在已加载的语音列表中挑选最合适的 zh-CN 语音 */
function pickZhVoice(preferredName?: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return undefined;

  const zh = voices.filter(
    (v) => v.lang?.toLowerCase().startsWith('zh') || v.lang?.toLowerCase().startsWith('cmn')
  );

  if (preferredName && zh.length) {
    const hit = zh.find((v) => v.name.toLowerCase().includes(preferredName.toLowerCase()));
    if (hit) return hit;
  }
  // 优先带 "Chinese"/"普通话"/"Mandarin" 的中文语音
  const named = zh.find((v) =>
    /chinese|mandarin|普通话|中文|国语/i.test(v.name)
  );
  return named || zh[0] || voices[0];
}

/**
 * 朗读一段文字。会先取消上一段朗读。
 * @returns 是否成功发起朗读
 */
export function speakText(text: string, opts: SpeakOptions = {}): boolean {
  if (!isSpeechSupported() || !text.trim()) return false;

  // 确保在部分浏览器里 getVoices 异步加载完成后再朗读
  const doSpeak = () => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang || 'zh-CN';
    u.pitch = opts.pitch ?? 0;
    u.rate = opts.rate ?? 1;
    const v = pickZhVoice(opts.voiceName);
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  };

  // Chrome 下首次 getVoices 可能为空，需要等 voiceschanged
  if (window.speechSynthesis.getVoices().length === 0) {
    const onVoices = () => {
      doSpeak();
      window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoices);
    // 兜底：1 秒后仍无语音则直接朗读（用默认音）
    setTimeout(() => {
      if (window.speechSynthesis.speaking === false) doSpeak();
    }, 1000);
    return true;
  }

  doSpeak();
  return true;
}

/** 停止当前朗读 */
export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}

/** 是否正在朗读 */
export function isSpeaking(): boolean {
  return isSpeechSupported() && window.speechSynthesis.speaking;
}

/**
 * 播放真实原声片段。若加载/播放失败（如文件缺失），通过 onError 回调让调用方降级到 TTS。
 */
export function playAudioClip(
  url: string,
  onError: (e: unknown) => void
): HTMLAudioElement {
  const audio = new Audio(url);
  audio.preload = 'auto';
  audio.onerror = (e) => onError(e);
  const p = audio.play();
  if (p && typeof p.catch === 'function') {
    p.catch((e) => onError(e));
  }
  return audio;
}

/**
 * 启动语音识别（语音输入）。
 * @param onResult 每次识别出文字时回调（ interim 为临时结果）
 * @param onEnd 结束时回调
 * @param onError 出错时回调
 */
export function startDictation(opts: {
  lang?: string;
  onResult: (text: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (e: any) => void;
}): { stop: () => void } | null {
  if (!isRecognitionSupported()) return null;

  const Recognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = new Recognition();
  rec.lang = opts.lang || 'zh-CN';
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (ev: any) => {
    let interim = '';
    let final = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }
    if (final) opts.onResult(final, true);
    else if (interim) opts.onResult(interim, false);
  };
  rec.onerror = (e: any) => opts.onError?.(e);
  rec.onend = () => opts.onEnd?.();

  try {
    rec.start();
  } catch (e) {
    opts.onError?.(e);
    return null;
  }
  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    },
  };
}

/** 服务端 TTS 是否可用（null=未探测，true/false=已探测结果） */
let serverTtsAvailable: boolean | null = null;

/**
 * 尝试用服务端 TTS 合成并播放（需后端配置 TTS_BASE_URL / TTS_API_KEY）。
 * 未配置或失败时返回 null，调用方应回退到浏览器内置朗读。
 * @returns 正在播放的 audio 元素，或 null
 */
export async function speakViaServer(
  text: string,
  opts: { voice?: string; rate?: number; onEnded?: () => void } = {}
): Promise<HTMLAudioElement | null> {
  if (serverTtsAvailable === false) return null; // 已确认不可用，不再重复请求
  if (!text.trim()) return null;

  try {
    const { getSupabaseUrl } = await import('@/supabase/client');
    const res = await fetch(`${getSupabaseUrl()}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, 2000),
        voice: opts.voice,
        speed: opts.rate ?? 1,
      }),
    });

    if (!res.ok) {
      // 501 = 后端未配置 TTS，记住结果，之后直接用浏览器朗读
      if (res.status === 501) serverTtsAvailable = false;
      return null;
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;

    serverTtsAvailable = true;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      opts.onEnded?.();
    };
    await audio.play();
    return audio;
  } catch {
    return null; // 网络/解析异常，静默回退
  }
}

/**
 * React Hook：封装朗读状态，方便在组件中调用。
 * 自动在组件卸载时停止朗读，避免"后台继续念"。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const supported = isSpeechSupported();
  const currentRef = useRef<{ kind: 'tts' | 'audio'; audio?: HTMLAudioElement } | null>(null);

  const stop = useCallback(() => {
    stopSpeaking();
    if (currentRef.current?.kind === 'audio') {
      currentRef.current.audio?.pause();
    }
    currentRef.current = null;
    setSpeaking(false);
  }, []);

  const read = useCallback(
    async (text: string, opts: SpeakOptions = {}) => {
      // 切换前先停掉上一段
      stop();

      // ① 优先尝试服务端 TTS（后端配置了 TTS_* 才生效），音色质量更好
      const serverAudio = await speakViaServer(text, {
        voice: opts.voiceName,
        rate: opts.rate,
        onEnded: () => setSpeaking(false),
      });
      if (serverAudio) {
        currentRef.current = { kind: 'audio', audio: serverAudio };
        setSpeaking(true);
        return true;
      }

      // ② 回退：浏览器内置朗读
      const ok = speakText(text, opts);
      if (ok) {
        currentRef.current = { kind: 'tts' };
        setSpeaking(true);
        // 监听结束
        const onEnd = () => setSpeaking(false);
        window.speechSynthesis.addEventListener('end', onEnd, { once: true });
      }
      return ok;
    },
    [stop]
  );

  const playClip = useCallback(
    (url: string, fallbackText: string, opts: SpeakOptions = {}) => {
      stop();
      const audio = playAudioClip(url, () => {
        // 原声文件缺失/失败 → 降级为 AI 朗读
        read(fallbackText, opts);
      });
      currentRef.current = { kind: 'audio', audio };
      setSpeaking(true);
      audio.onended = () => setSpeaking(false);
    },
    [stop, read]
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { supported, speaking, read, playClip, stop };
}
