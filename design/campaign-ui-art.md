# PVE 思辨闯关对话框 · 游戏化视觉改造规格

> 文档类型：美术 / 视觉规格（仅规格与具体 class 建议，**不写组件代码**）
> 适用范围：`src/components/CampaignChallenge.tsx`（闯关对谈对话框）、`src/routes/campaign.tsx`（关卡地图页 header）
> 关联文档：`design/campaign-ui-ux.md`（UX 规格，本规格为其提供色板与控件视觉）；`src/styles.css`（Tailwind v4 oklch 主题基线）
> 目标基调：**神秘 · 奥术 · 思辨 · 史诗感**（深空基底 + 流金描边 + 发光）

---

## 0. 主题现状核对（避免与真实代码冲突）

源码 `src/styles.css` 实际是 **"Dark Academic / Parchment & Ink"** 暗色学术主题，并非字面的"思想银河"。但它已具备用户想要的"神秘/史诗"内核，本规格**完全复用其真实 token**，不臆造新依赖：

| 现有 token（`:root` oklch） | 值 | 本规格用途 |
|---|---|---|
| `--background` | `oklch(0.18 0.02 260)` | 深空底（蓝黑） |
| `--primary`（古金） | `oklch(0.65 0.12 85)` | 流金主色、发光 |
| `--foreground` | `oklch(0.92 0.01 80)` | 暖白文字 |
| `--card` | `oklch(0.22 0.03 70)` | 通用卡片（偏暖） |
| `--muted` / `--muted-foreground` | `oklch(0.28 0.04 65)` / `oklch(0.6 0.03 70)` | 次级表面 / 弱文字 |
| `--accent`（酒红） | `oklch(0.45 0.15 25)` | 破坏态点缀 |
| `--border` | `oklch(0.3 0.04 60 / 0.5)` | 默认描边 |

**已有可复用工具类**：`.gradient-text-gold`（金色流光标题）、`.glass-card`、`.animate-glow-pulse`（金辉脉冲）、`.gold-line`、`.dark-scroll`、`.card-hover`。本规格新增的 class 全部与它们同范式，写入 `src/styles.css` 即可，无需改 `tailwind.config`（v4 CSS-first，无 config 文件）。

> ⚠️ 现状痛点：当前 `CampaignChallenge` 用通用 shadcn token（`bg-card` / `border-border` / `bg-primary` / `bg-muted`），气泡用 `bg-primary text-primary-foreground` —— 观感偏"后台管理"。改造核心是：**把面板从"卡片"升级为"奥术石板"，把气泡从"按钮色块"升级为"有身份的发光线"**。

---

## 1. 设计目标与视觉支柱

1. **深空奥术基底**：面板不再用 `bg-card`（暖棕），改用更冷、更深的"靛黑"，叠加顶部金色径向辉光，像一块悬浮的星界石板。
2. **流金描边 + 发光**：所有主结构（面板、关徽、用户气泡、主按钮）带金色 glow 描边；哲学家侧用"奥术冷色"辉光作对比。
3. **voice 身份化**：哲学家气泡=暖羊皮纸暗底 + 学派冷色微描边 + 头像学派环光；用户气泡=暗底金描边发光（"你被点亮的言辞"）。两者一眼可辨，但**都不破坏暗色神秘基调**。
4. **胜负可读性**：评分通过=金光，未达标=灰；**绝不靠颜色 alone**（配图标 + 文字标签 + 数字）。
5. **可访问性内建**：对比度达 WCAG AA；`prefers-reduced-motion` 下关掉所有辉光/流光动画，仅留静态描边。

---

## 2. 配色变量建议（新增 token + 工具类）

### 2.1 在 `:root` 新增（紧跟现有 `--gold` 之后）

```css
/* === Campaign Challenge 专属色板（奥术/流金） === */
--campaign-panel:        oklch(0.17 0.025 275);   /* 面板基底：深靛黑（比 --card 更冷更深） */
--campaign-panel-2:      oklch(0.21 0.03 285);    /* 面板渐变上沿 */
--campaign-surface:      oklch(0.24 0.025 280);   /* 次级表面：输入框/气泡可用底 */
--campaign-gold:         oklch(0.7 0.14 85);      /* 流金（填充/描边/glow 用） */
--campaign-gold-strong:  oklch(0.82 0.12 85);     /* 深色底上的金色文字（保 AA） */
--campaign-arcane:       oklch(0.62 0.15 285);    /* 奥术冷色（默认哲学家强调） */
--campaign-user:         oklch(0.72 0.13 85);     /* 用户气泡填充（暖金） */
--campaign-user-fg:      oklch(0.16 0.02 270);    /* 用户气泡文字（近黑靛） */
--campaign-philosopher:  oklch(0.27 0.03 70);     /* 哲学家气泡底（暖羊皮纸暗） */
--campaign-era-ancient:      oklch(0.62 0.10 65); /* 学派色·古（古铜） */
--campaign-era-modern:       oklch(0.60 0.13 250);/* 学派色·近（青蓝） */
--campaign-era-contemporary: oklch(0.62 0.15 295);/* 学派色·当（紫罗兰） */
--campaign-pass:         oklch(0.78 0.13 85);     /* 通过（亮金） */
--campaign-fail:         oklch(0.62 0.04 70);     /* 未达标（暖灰） */
```

### 2.2 在 `@theme inline` 暴露为 Tailwind 工具类（紧接现有 `--color-gold` 区块）

```css
/* Campaign Challenge 工具类映射（v4 自动生成 bg-/text-/border-/ring-campaign-*） */
--color-campaign-panel:        var(--campaign-panel);
--color-campaign-panel-2:     var(--campaign-panel-2);
--color-campaign-surface:     var(--campaign-surface);
--color-campaign-gold:        var(--campaign-gold);
--color-campaign-gold-strong: var(--campaign-gold-strong);
--color-campaign-arcane:      var(--campaign-arcane);
--color-campaign-user:        var(--campaign-user);
--color-campaign-user-fg:     var(--campaign-user-fg);
--color-campaign-philosopher: var(--campaign-philosopher);
--color-campaign-era-ancient:      var(--campaign-era-ancient);
--color-campaign-era-modern:       var(--campaign-era-modern);
--color-campaign-era-contemporary: var(--campaign-era-contemporary);
--color-campaign-pass:        var(--campaign-pass);
--color-campaign-fail:        var(--campaign-fail);
```

> 加完后工程即可直接写 `bg-campaign-panel`、`text-campaign-gold-strong`、`ring-campaign-era-modern` 等。**下方所有 class 建议默认按"已加上述 token"给出**；若暂未加，等价写法用任意值 `bg-[oklch(0.17_0.025_275)]` 兜底（已标注）。

### 2.3 在 `src/styles.css` 新增工具类（与 `.glass-card` 同位置）

```css
/* 奥术石板面板：深靛黑 + 顶部金辉 + 金描边 + 柔和外发光 */
.campaign-panel {
  background:
    radial-gradient(120% 70% at 50% -12%, oklch(0.7 0.14 85 / 0.10), transparent 60%),
    linear-gradient(180deg, var(--campaign-panel-2), var(--campaign-panel));
  border: 1px solid oklch(0.7 0.14 85 / 0.30);
  box-shadow:
    0 0 0 1px oklch(0.7 0.14 85 / 0.08),
    0 24px 70px -20px oklch(0.7 0.14 85 / 0.30),
    0 30px 90px -30px oklch(0 0 0 / 0.85);
}
.glow-gold   { box-shadow: 0 0 24px -4px oklch(0.7 0.14 85 / 0.55); }
.glow-arcane { box-shadow: 0 0 22px -4px oklch(0.62 0.15 285 / 0.50); }
.ring-glow-gold {
  box-shadow: 0 0 0 2px oklch(0.7 0.14 85 / 0.45), 0 0 18px -2px oklch(0.7 0.14 85 / 0.50);
}
/* 主行动按钮：金色流光渐变 + 发光；禁用态"熄灭"而非单纯半透明 */
.btn-campaign-primary {
  background: linear-gradient(135deg, oklch(0.78 0.13 85), oklch(0.66 0.14 70));
  color: oklch(0.16 0.02 270);
  box-shadow: 0 0 22px -4px oklch(0.7 0.14 85 / 0.60);
  transition: box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.btn-campaign-primary:hover { box-shadow: 0 0 32px -2px oklch(0.7 0.14 85 / 0.78); }
.btn-campaign-primary:disabled,
.btn-campaign-primary[aria-disabled="true"] {
  background: oklch(0.28 0.03 70);
  color: oklch(0.55 0.03 70);
  box-shadow: none;            /* 关闭发光 = 视觉"断电" */
  cursor: not-allowed;
}
/* 减弱动效：关辉光/流光，仅留静态描边，保证可读与舒适 */
@media (prefers-reduced-motion: reduce) {
  .campaign-panel, .glow-gold, .glow-arcane, .ring-glow-gold,
  .btn-campaign-primary, .animate-glow-pulse, .gradient-text-gold {
    animation: none !important;
    box-shadow: none !important;
  }
}
```

> 若沿用 shadcn `Button`（`disabled:opacity-50` 来自 cva），`.btn-campaign-primary:disabled` 的样式会与 `opacity-50` 叠加。推荐：主行动按钮改用普通 `<button className="btn-campaign-primary ...">` 或给 `Button` 追加 `disabled:opacity-100` 以让"熄灭"态生效（见 §8 决策 E）。

### 2.4 学派色（头像环光 / 装饰）映射建议

数据层没有 school→color，但 `philosopher.era`（`ancient|modern|contemporary`）是**有类型、有既有配色意图**（见 `generatePortrait` 的 `eraColors`）的稳定字段。**推荐以 `era` 驱动学派色**，避免维护一张自由文本 school 表：

```ts
// 建议的样式映射（非组件代码，供工程套用 className）
const ERA_RING: Record<Philosopher['era'], string> = {
  ancient:      'ring-campaign-era-ancient glow-arcane',       // 古铜环光
  modern:       'ring-campaign-era-modern glow-arcane',        // 青蓝环光
  contemporary: 'ring-campaign-era-contemporary glow-arcane',  // 紫罗兰环光
};
```

---

## 3. 对话框整体面板（Overlay + Content）

| 区域 | 现状 class | 建议 class |
|---|---|---|
| **Content**（`DialogContent`，L211） | `max-w-4xl h-[88vh] overflow-hidden bg-card border-border/50` | `max-w-4xl h-[88vh] overflow-hidden campaign-panel rounded-2xl` |
| 圆角 | `sm:rounded-lg`（来自 ui/dialog 基类） | 覆盖为 `rounded-2xl`（更"史诗"） |
| 滚动区 | `ScrollArea ... className="flex-1 px-4"` | 追加 `dark-scroll`（深底细滚动条） |

- **面板用 `.campaign-panel` 取代 `bg-card`**：自带深靛黑渐变 + 金描边 + 外发光。注意 `ui/dialog.tsx` 基类带 `bg-background`，`.campaign-panel` 的 `background` 简写会覆盖它（shorthand 优先于 `background-color`）；若工程担心层叠顺序，可在 Content 上再补 `!bg-transparent` 保险。
- **Overlay（遮罩）**：当前 `DialogOverlay` 默认 `bg-black/80`，**`CampaignChallenge` 未传 overlay className**。建议二选一：① 给 `Dialog` 调用处补一个 `overlayClassName`（工程改 `CampaignChallenge`）；② 在 `styles.css` 用作用域类覆盖：
  ```css
  [data-campaign] [data-slot="dialog-overlay"],
  [data-campaign] [data-radix-dialog-overlay] {
    background:
      radial-gradient(80% 60% at 50% 40%, oklch(0.7 0.14 85 / 0.06), transparent 70%),
      oklch(0 0 0 / 0.82);
    backdrop-filter: blur(4px);
  }
  ```
  推荐轻量径向辉光 + `blur(4px)`，呼应"星界"而不喧宾夺主（见 §8 决策 D）。

---

## 4. 标题栏（哲学家名 + 关徽 + Swords + 学派色）

| 元素 | 现状 | 建议 |
|---|---|---|
| `DialogHeader`（L212） | `border-b border-border/50 pb-4` | `border-b border-[oklch(0.7_0.14_85/0.25)] pb-4` |
| 哲学家头像（L219） | `w-12 h-12 rounded-full border-2 border-primary` | `w-12 h-12 rounded-full border-2 border-campaign-gold ring-2 ring-campaign-era-{era} ring-offset-2 ring-offset-campaign-panel glow-arcane`（学派环光） |
| Swords 关徽（L226-228） | `bg-primary rounded-full ... text-primary-foreground` | `bg-campaign-gold text-campaign-user-fg ring-2 ring-campaign-panel shadow-[0_0_12px_oklch(0.7_0.14_85/0.6)]`（做成"印章/关徽"） |
| 标题名（L232） | `font-display text-lg` | `font-display text-lg gradient-text-gold`（"挑战 · "用 `text-foreground`，名字用流金） |
| 关卡徽章（L235） | `bg-primary/15 text-primary` | `bg-campaign-gold/15 text-campaign-gold-strong`（提对比） |
| 学派行（L239-241） | `text-xs text-muted-foreground`（仅文字） | `text-xs text-muted-foreground` + 前置小色点 `inline-block w-2 h-2 rounded-full bg-campaign-era-{era}` + 学派名文字（**色点仅为装饰，信息靠文字**，满足不靠颜色区分） |

> 头像环光用 `.glow-arcane`（冷色），与关徽的金色辉光形成"冷·热"身份对比，一眼区分"哲学家（奥术）"与"挑战（金）"。

---

## 5. 对谈气泡（哲学家 vs 用户）

### 5.1 气泡本体（L335-341）

| 角色 | 现状 | 建议（主方案） | 备注 |
|---|---|---|---|
| **用户**（你） | `bg-primary text-primary-foreground` | `bg-campaign-surface text-campaign-gold-strong border border-campaign-gold/40 glow-gold` | 暗底 + 金描边 + 金光，**"被点亮的言辞"**；保留神秘暗调 |
| **哲学家** | `bg-muted text-foreground` | `bg-campaign-philosopher text-foreground border border-campaign-arcane/30` | 暖羊皮纸暗底 + 奥术冷色微描边；与用户金光区分 |

- **用户气泡备选（更张扬）**：实心金 `bg-campaign-user text-campaign-user-fg glow-gold`（每句都金，冲击强但略重，可能削弱"神秘"）。**默认推荐主方案**（暗底金描边），是否换实心见 §8 决策 A。
- **哲学家气泡备选**：若想更"奥术冷"，可改用 `bg-campaign-surface text-foreground border-campaign-arcane/40`（冷底而非暖底）。默认暖羊皮纸（见 §8 决策 B）。

### 5.2 头像（气泡左侧，L316-320）

| 角色 | 现状 | 建议 |
|---|---|---|
| 用户头像 | `bg-primary/20` | `bg-campaign-user/20 ring-1 ring-campaign-user/40` |
| 哲学家头像 | `bg-muted` | `bg-campaign-philosopher ring-1 ring-campaign-era-{era}/50 glow-arcane` |

### 5.3 流式输出（L351-391）

| 元素 | 现状 | 建议 |
|---|---|---|
| 流式打字光标（L367） | `bg-primary animate-pulse` | `bg-campaign-gold animate-pulse`（或 `animate-glow-pulse`） |
| "思考中" Loader（L387） | `text-primary` | `text-campaign-arcane` + 维持 `animate-spin` |
| "思考中" 文案（L388） | `text-muted-foreground` | 维持（弱文字，非关键信息） |

---

## 6. 五维评分结果面板（通过 / 未达标）

位置：评分子面板（L248-303）。**核心原则：用 图标 + 文字标签 + 数字 三重区分，绝不只靠颜色。**

### 6.1 面板容器

| 状态 | 现状 | 建议 |
|---|---|---|
| **通过**（L252-253） | `bg-primary/10 border-primary/30` | `bg-campaign-gold/10 border-campaign-gold/40 glow-gold` + 顶部 `.gold-line` 流金分隔 |
| **未达标**（L254） | `bg-muted/40 border-border/50` | `bg-campaign-fail/15 border-campaign-fail/40` |

### 6.2 状态标识（图标 + 文字，L257-275）

| 元素 | 通过 | 未达标 |
|---|---|---|
| 图标（L259-263） | `Trophy` + `text-campaign-gold glow-gold` | `RotateCcw` + `text-campaign-fail` |
| 文字标签（L265） | `评判通过`（gold-strong） | `尚未达标`（fail / foreground） |
| 总分（L267-274） | `text-campaign-gold-strong` | `text-campaign-fail` |
| 解锁提示（L276-280） | `CheckCircle2` + `text-campaign-gold` | —（仅通过时出现） |

### 6.3 五维 Progress 条（L283-294）

当前 `<Progress>` 指示器硬编码 `bg-primary`、轨道 `bg-primary/20`。**建议工程让 `Progress` 接受 `indicatorClassName`**（小改动），或套用 Tailwind v4 任意变体覆盖子节点：`className="[&>div]:bg-campaign-gold"`（通过）/`[&>div]:bg-campaign-fail`（未达标）。

**维度按分档着色（同时始终显示数字，见 L290-292 已有值）**：

```ts
// 建议的分档映射（非组件代码）
function scoreBarClass(v: number): string {
  if (v >= 80) return 'bg-campaign-gold';        // 卓越·金
  if (v >= 60) return 'bg-campaign-gold/70';     // 合格·淡金
  return 'bg-campaign-fail';                      // 偏弱·暖灰
}
```

- 轨道：`bg-campaign-surface/70`（比原 `bg-primary/20` 更中性，不暗示"已填即好"）。
- **不靠颜色 alone**：右侧已有 `{value}` 数字（L291），且在 `<span>` 中；色条仅作增强。色觉障碍用户仍可凭数字与标签判断。

---

## 7. 输入区与主行动按钮

### 7.1 输入区（L404-428）

| 元素 | 现状 | 建议 |
|---|---|---|
| 分隔线（L404） | `border-t border-border/50 pt-4 mt-2 px-4` | `border-t border-[oklch(0.7_0.14_85/0.2)] pt-4 mt-2 px-4` |
| 文本框（L412） | `bg-muted/50 border border-border/50 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary ...` | `bg-campaign-surface/60 border border-[oklch(0.7_0.14_85/0.25)] rounded-xl focus:ring-2 focus:ring-campaign-gold/50 focus:border-campaign-gold transition-all text-sm min-h-[48px] max-h-[120px] placeholder:text-muted-foreground/70` |
| 发送按钮·激活（L422） | `bg-primary text-primary-foreground hover:bg-primary/90` | `bg-campaign-gold text-campaign-user-fg hover:bg-campaign-gold-strong glow-gold` |
| 发送按钮·禁用（L423） | `bg-muted text-muted-foreground cursor-not-allowed` | `bg-campaign-surface text-muted-foreground cursor-not-allowed` |

### 7.2 主行动按钮「提交评判」（L435-446）

这是页面**唯一主行动**，需最强"金色史诗"表现：

| 状态 | 建议 |
|---|---|
| 默认 | `btn-campaign-primary gap-2`（金色流光渐变 + 发光；文字近黑靛，对比极高） |
| hover | 由 `.btn-campaign-primary:hover` 提供更强辉光 |
| 禁用（流式/评判中） | `btn-campaign-primary` 的 `:disabled` 态（熄灭：灰底 + 无辉光 + `cursor-not-allowed`）；同时维持 `disabled:opacity-100`（见 §8 决策 E） |
| 图标 | `Swords`（常态）/ `Loader2 animate-spin`（评判中），维持 |

> 若工程不愿引入 `.btn-campaign-primary` 类，可内联：`bg-gradient-to-r from-[oklch(0.78_0.13_85)] to-[oklch(0.66_0.14_70)] text-[oklch(0.16_0.02_270)] shadow-[0_0_22px_oklch(0.7_0.14_85/0.6)] hover:shadow-[0_0_32px_oklch(0.7_0.14_85/0.78)] disabled:bg-[oklch(0.28_0.03_70)] disabled:text-[oklch(0.55_0.03_70)] disabled:shadow-none`。

---

## 8. 新增 UX 控件的视觉（与 `campaign-ui-ux.md` 对齐）

以下控件由 UX 规格新增，本规格给出可直接套用的 class：

> ✅ **形态已锁定**（关联 UX 决策 B）：「提交评判」用 `AlertDialog`（见下表「提交二次确认弹窗」），「清空重来」用两态按钮 + 5s 撤销 toast（见下表「清空重来」），**不**为清空另建弹窗。

| 控件 | 来源（UX 章节） | 建议 class |
|---|---|---|
| **「回到底部」浮钮** | §2.3 | `absolute bottom-4 right-4 z-10 h-9 w-9 rounded-full glass-card border border-campaign-gold/30 text-campaign-gold-strong ring-glow-gold flex items-center justify-center`，`aria-label="回到底部"`，图标 `ChevronDown` |
| **「返回主页」**（地图 header） | §2.9 | `inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-campaign-gold-strong transition-colors`，图标 `ArrowLeft`/`Home` + "返回主页" |
| **「返回关卡」**（对话框内） | §2.8 | `inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-campaign-gold-strong border border-[oklch(0.7_0.14_85/0.25)] rounded-lg px-2.5 py-1.5 transition-colors`，图标 `ArrowLeft` |
| **「清空重来」/「重新开始」**（对话框内重置，破坏性） | §2.6 / §2.1 / §6.1 | `inline-flex items-center gap-1.5 text-xs text-campaign-fail hover:text-destructive border border-campaign-fail/40 hover:border-destructive/50 rounded-lg px-2.5 py-1.5 transition-colors`，图标 `Eraser`/`RotateCcw`。**与「清空重来」语义一致、同一动作**（两态「确认清空？」+ 5s 撤销 toast）；主理人已签命名「重新开始」（与地图「再战」呼应），工程任选标签，视觉 class 不变。 |
| **提交二次确认弹窗** | §2.7 / §6.1 | 复用 `Dialog` 结构，外层加 `campaign-panel rounded-2xl border-campaign-gold/40 glow-gold`；警告文案 `text-campaign-gold-strong`；确认钮 `btn-campaign-primary`；取消钮 `border border-[oklch(0.7_0.14_85/0.3)] text-muted-foreground` |
| **草稿恢复提示**（可选） | §2.1 / §2.5 | 恢复时顶部小药丸：`inline-flex items-center gap-1.5 text-xs text-campaign-gold-strong bg-campaign-gold/10 border border-campaign-gold/30 rounded-full px-3 py-1`，图标 `History` + "已恢复上次对谈" |

> ✅ **UX 决策 A 已签（judgeResult 轻量持久·仅展示）**：草稿现可存上次评分，重开时**仅恢复展示评分面板**——沿用 §6「通过/未达标」呈现，**不**触发发奖、不弹「已解锁下一关」徽标（`justCleared` 恢复态不出现）、不影响服务器 `bestScores`。无需新增控件；上表「草稿恢复提示」药丸可同时提示"已恢复上次对谈与评分"。

---

## 9. 可访问性（Accessibility）

### 9.1 对比度（WCAG AA 目标）

| 文字色 | 背景 | 预期 | 说明 |
|---|---|---|---|
| `text-campaign-gold-strong`（L0.82） | `campaign-panel`（L0.17） | ≥ 7:1（AAA） | 主金文字 |
| 用户气泡：`text-campaign-user-fg`（近黑） | `bg-campaign-user`/surface 金 | ≥ 7:1 | 金底深字 |
| 哲学家气泡：`text-foreground`（L0.92） | `bg-campaign-philosopher`（L0.27） | ≥ 7:1 | 暖暗底亮字 |
| `text-muted-foreground`（L0.6） | `campaign-panel` | ~3.5–4:1 | **仅用于次级/非必要文字**（如"思考中"、学派名）；关键信息用 foreground / gold-strong |
| `text-campaign-fail`（L0.62） | `campaign-fail` 底 / panel | 大字号达标 | "尚未达标"标签放大或用 foreground，避免小字低对比 |

> ✅ 建议在质量门用 axe / 对比度工具对上面组合做一次性核验（本规格为设计预期值，非实测）。

### 9.2 不靠颜色区分信息（color-independent）

- **通过 / 未达标**：`Trophy` vs `RotateCcw` 图标 + 文字标签（"评判通过"/"尚未达标"）+ 总分数字，三重编码。
- **五维分数**：每维右侧恒有数字（L291），色条仅增强。
- **学派色**：小色点为装饰，信息以**学派名文字**承载；`era` 环光同时配头像本身。
- **聚焦可达**：全局 `:focus-visible` 已是金色描边（styles.css）；所有交互件（按钮、文本框、FAB、返回键）均保持 `focus-visible` ring，不丢焦点样式。

### 9.3 动效减弱

- 所有辉光/流光（`.campaign-panel`、`.glow-*`、`.btn-campaign-primary`、`.animate-glow-pulse`、`.gradient-text-gold`）在 `prefers-reduced-motion: reduce` 下关闭动画与 `box-shadow`（§2.3 媒体查询），仅留静态 `border` 描边，保证可读与舒适。
- 流式打字光标脉冲在减弱动效时降级为静态（配合 UX §6.2）。

---

## 10. 与现有 Tailwind v4 / oklch 兼容性说明

1. **v4 CSS-first**：本项目无 `tailwind.config.js`，配色在 `src/styles.css` 的 `@theme inline` + `:root` 定义。本规格新增 token 完全沿用此模式，**无需任何 config 改动、无新依赖**。
2. **oklch 原生支持**：Tailwind v4 与浏览器均原生支持 `oklch()`；任意值写法 `bg-[oklch(0.17_0.025_275)]` 在 v4 直接可用（空格转 `_`，alpha 用 `/`）。
3. **复用既有类**：`.gradient-text-gold`、`.glass-card`、`.dark-scroll`、`.animate-glow-pulse`、`.gold-line` 直接复用，风格统一。
4. **层叠注意**：`.campaign-panel` 用 `background` 简写覆盖 `ui/dialog.tsx` 基类的 `bg-background`；若担心顺序，Content 补 `!bg-transparent`（已说明 §3）。
5. **`Progress` 着色**：建议工程给 `Progress` 增加 `indicatorClassName` prop（小改），否则用 `[&>div]:bg-*` 任意变体（v4 支持）。

---

## 11. 落地清单（逐组件 class 对照）

| 文件 / 行 | 现状 | 改后（建议） |
|---|---|---|
| `CampaignChallenge.tsx` L211 Content | `bg-card border-border/50` | `campaign-panel rounded-2xl` |
| L212 Header | `border-border/50` | `border-[oklch(0.7_0.14_85/0.25)]` |
| L219 头像 | `border-2 border-primary` | `+ ring-2 ring-campaign-era-{era} ring-offset-2 ring-offset-campaign-panel glow-arcane` |
| L226-228 关徽 | `bg-primary ... text-primary-foreground` | `bg-campaign-gold text-campaign-user-fg ring-2 ring-campaign-panel shadow-[0_0_12px_oklch(0.7_0.14_85/0.6)]` |
| L232 名 | `font-display text-lg` | `+ gradient-text-gold`（仅名字） |
| L235 关卡徽 | `bg-primary/15 text-primary` | `bg-campaign-gold/15 text-campaign-gold-strong` |
| L239-241 学派 | 仅文字 | `+ 小色点 bg-campaign-era-{era}` |
| L252-254 评分容器 | `bg-primary/10 border-primary/30` / `bg-muted/40 border-border/50` | `bg-campaign-gold/10 border-campaign-gold/40 glow-gold` / `bg-campaign-fail/15 border-campaign-fail/40` |
| L260 / L262 图标 | `text-primary` / `text-muted-foreground` | `text-campaign-gold glow-gold` / `text-campaign-fail` |
| L270 总分 | `text-primary` / `text-muted-foreground` | `text-campaign-gold-strong` / `text-campaign-fail` |
| L289 维度条 | `Progress` 默认 `bg-primary` | `[&>div]:bg-campaign-gold`（通过）/ 分档 `scoreBarClass`；轨道 `bg-campaign-surface/70` |
| L316-320 气泡头像 | `bg-primary/20` / `bg-muted` | `bg-campaign-user/20 ring-1 ring-campaign-user/40` / `bg-campaign-philosopher ring-1 ring-campaign-era-{era}/50 glow-arcane` |
| L335-341 气泡 | `bg-primary text-primary-foreground` / `bg-muted text-foreground` | `bg-campaign-surface text-campaign-gold-strong border border-campaign-gold/40 glow-gold` / `bg-campaign-philosopher text-foreground border border-campaign-arcane/30` |
| L367 光标 | `bg-primary animate-pulse` | `bg-campaign-gold animate-pulse` |
| L387 Loader | `text-primary` | `text-campaign-arcane` |
| L404 输入分隔 | `border-border/50` | `border-[oklch(0.7_0.14_85/0.2)]` |
| L412 文本框 | `bg-muted/50 border-border/50 focus:ring-primary/50 focus:border-primary` | `bg-campaign-surface/60 border-[oklch(0.7_0.14_85/0.25)] focus:ring-campaign-gold/50 focus:border-campaign-gold` |
| L422 发送·激活 | `bg-primary text-primary-foreground` | `bg-campaign-gold text-campaign-user-fg hover:bg-campaign-gold-strong glow-gold` |
| L423 发送·禁用 | `bg-muted text-muted-foreground` | `bg-campaign-surface text-muted-foreground cursor-not-allowed` |
| L435 提交按钮 | `Button` 默认 `variant` | `btn-campaign-primary gap-2`（禁用态由 `.btn-campaign-primary:disabled` 接管） |
| `campaign.tsx` header | 无返回主页 | 新增「返回主页」`ArrowLeft` + `hover:text-campaign-gold-strong` |
| 新增控件 | — | 见 §8 表格（FAB / 返回关卡 / 清空重来 / 确认弹窗 / 恢复提示） |

---

## 12. 设计决策状态

> ✅ = 已确认 / 锁定 / 随规格交付（采用推荐项）。**本规格现已全部锁定，可交付 engineering-lead（task #3）落地。**

- **A｜用户气泡风格** ✅ 已交付（默认推荐）：暗底金描边发光（保神秘）；备选实心金填充未采用。
- **B｜哲学家气泡底色** ✅ 已交付（默认推荐）：暖羊皮纸暗（呼应"羊皮纸"主题）；备选奥术冷底未采用。
- **C｜学派色来源** ✅ **已确认**：`era` 三色（`ancient` 古铜 / `modern` 青蓝 / `contemporary` 紫罗兰）。design-strategist 已核对 `src/data/philosophers.ts` 的 `era: 'ancient'|'modern'|'contemporary'` 为既有类型字段，且与 `generatePortrait` 的 `eraColors` 配色一致，数据稳定、零维护。`ERA_RING` 映射（§2.4）可安全套用。
- **D｜Overlay 遮罩** ✅ 已交付（默认推荐）：轻量径向辉光 + `blur(4px)`；备选 `bg-black/80` 未采用。
- **E｜主按钮禁用态** ✅ 工程按推荐实现：`.btn-campaign-primary:disabled`"熄灭"态（需 `disabled:opacity-100` 抵消 shadcn `opacity-50`）。
- **F｜Overlay className 注入方式** ✅ 工程按推荐实现：给 `CampaignChallenge` 的 `Dialog` 增加 `overlayClassName` prop。
- **弹窗形态（关联 UX 决策 B）** ✅ **已锁定**：「提交评判」= `AlertDialog`（锁分/发奖不可逆）→ 用 §8「提交二次确认弹窗」样式（复用 Dialog + `campaign-panel rounded-2xl border-campaign-gold/40 glow-gold`，确认钮 `btn-campaign-primary`，取消钮描边幽灵态，警告文案 `text-campaign-gold-strong`，并设 `aria-describedby`）；「清空重来」= 两态按钮 + 5s 撤销 toast → 用 §8「清空重来/重新开始」描边按钮态（暖灰失败色），**不**另建弹窗。
- **UX 决策 A（judgeResult 轻量持久·仅展示 + 重新开始命名）** ✅ **已签**：重开仅恢复展示评分面板（§6 呈现，无 `justCleared` 徽标、不发奖、不影响 `bestScores`）；对话框内重置控件命名「重新开始」、与「清空重来」同一动作（见 §8）。

> 交叉引用：UX §8 决策 A/B/C/D 现已全部签署——A（judgeResult 仅展示 + 「重新开始」命名）、B（提交=AlertDialog / 清空=两态+撤销）、C（纳入 input）、D（200 条 / 30 天）。视觉与 UX 两份规格已完全对齐、全部锁定，可交付工程。
