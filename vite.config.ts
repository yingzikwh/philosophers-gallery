import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * React + Vite 构建配置 (本地部署版)
 *
 * - dev server 监听 3015
 * - /sb-api 请求代理到本地后端服务器 (端口 3016)
 * - outDir 'dist' / assetsDir 'assets'
 */
export default defineConfig({
  plugins: [
    tailwindcss(),
    TanStackRouterVite(),
    viteReact(),
    tsConfigPaths(),
  ],
  server: {
    host: "0.0.0.0",
    port: 3015,
    strictPort: true,
    allowedHosts: true,
    hmr: false,
    proxy: {
      // 将前端 Supabase API 请求代理到本地 Express 服务器
      "/sb-api": {
        target: "http://localhost:3016",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sb-api/, ""),
      },
      // 新端点（著作新闻等）直接走 /api 前缀，代理到本地后端
      "/api": {
        target: "http://localhost:3016",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
