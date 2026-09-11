/**
 * 本地后端 API 基址。
 *
 * 这里曾由 Meoo Cloud 自动生成的 src/supabase/client.ts 提供 getSupabaseUrl()。
 * 但项目后端早已迁移为本地 node:http 服务（server/index.js），仅为取一个 URL
 * 字符串而静态引入整个 @supabase/supabase-js 代价过高：SDK 会被打进主包，
 * 且模块加载时还会用硬编码的 anon key 执行 createClient()。
 * 故改为等价实现，行为与原函数完全一致（保留 MEOO_CONFIG 覆盖能力）。
 *
 * 返回值形如 `${origin}/sb-api`，由 vite.config.ts 的代理转发到 localhost:3016。
 */
export function getApiBase(): string {
  const meoo = (window as unknown as { MEOO_CONFIG?: { meoo_app_access_url?: string } })
    .MEOO_CONFIG;
  return `${meoo?.meoo_app_access_url || window.location.origin}/sb-api`;
}
