import { useState, type CSSProperties } from 'react';

/** 加载失败时的内联占位图：深底 + 人形剪影，保证任何情况下不出现破图图标 */
const FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#1c212b"/>' +
      '<circle cx="32" cy="25" r="11" fill="#4b5563"/>' +
      '<path d="M10 60c2-14 11-20 22-20s20 6 22 20z" fill="#4b5563"/>' +
      '</svg>'
  );

interface PortraitProps {
  src: string;
  alt: string;
  /** 尺寸与外观类；须含 w-/h- 以固定盒尺寸、消除布局偏移 */
  className?: string;
  /** 首屏关键肖像可设为 true 关闭懒加载 */
  eager?: boolean;
  style?: CSSProperties;
}

/**
 * 统一肖像图：懒加载 + 异步解码 + 失败降级为内联占位图。
 * 盒尺寸由 className 的 w-/h- 声明，避免累积布局偏移（CLS）。
 */
export function Portrait({ src, alt, className, eager = false, style }: PortraitProps) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed ? FALLBACK : src}
      alt={alt}
      className={className}
      style={style}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
