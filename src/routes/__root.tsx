// 根布局：Provider 放这里；页面路由在 src/routes/ 下单独建文件，勿堆进 index.tsx
import {
  Outlet,
  Navigate,
  createRootRoute,
  useRouterState,
} from '@tanstack/react-router';
import { Toaster } from '@/components/ui/sonner';

function NotFoundComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === '/') return null;
  return <Navigate to="/" replace />;
}

function ErrorComponent({ error }: { error: Error; reset: () => void }) {
  console.error(error);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // 已在首页仍报错时不再 redirect，避免 / → / 死循环
  if (pathname === '/') return null;
  return <Navigate to="/" replace />;
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  return (
    <>
      <Outlet />
      {/*
        全局 toast 渲染器。sonner 的 toast() 只是把消息推进队列，必须有 Toaster
        挂载才会渲染；此前 ui/sonner.tsx 从未被引用，导致闯关页的
        toast.success / toast.error（通关、未达通关线、清空对谈撤销等）全部静默失效。
        position 用顶部居中，避开右下角的悬浮胶囊入口。
      */}
      <Toaster position="top-center" />
    </>
  );
}
