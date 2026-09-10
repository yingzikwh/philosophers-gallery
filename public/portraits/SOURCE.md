# 肖像图像来源与许可

本目录存放使用**真实历史照片**的思想家肖像。其余思想家肖像为 AI 生成图，
以 CDN 链接形式写在 `src/data/philosophers.ts` 中（`g.cdn.meoo.host/agent-generated-images/...`）。

| 文件 | 人物 | 来源 | 许可 |
|------|------|------|------|
| `mao.jpg` | 毛泽东 | Wikimedia Commons · [Mao Zedong 1950 Portrait (3x4 cropped)](https://commons.wikimedia.org/wiki/File:Mao_Zedong_1950_Portrait_%283x4_cropped%29.jpg)，1950-11-10 摄于北京的官方肖像 | Public domain（中国著作权保护期已届满） |
| `zhou.jpg` | 周恩来 | Wikimedia Commons · [Zhou Enlai in 1959](https://commons.wikimedia.org/wiki/File:Zhou_Enlai_in_1959.jpg)，1959 年 | Public domain（中国著作权保护期已届满） |

## 处理说明

- 原图经等比缩放至宽 512px，并以 JPEG（质量 0.88）重编码，未做裁剪或其他修改
- 在 `src/data/philosophers.ts` 中以 `/portraits/<id>.jpg` 引用，由 Vite 从 `public/` 静态提供
- 相比 CDN 外链，本地图像不依赖外部 `auth_key`，克隆仓库即可离线显示

## 新增肖像约定

- 文件名与思想家 `id` 保持一致（如 `mao.jpg`、`zhou.jpg`）
- 优先选用公有领域或可自由授权的官方照片，并在上表登记来源与许可
- 若暂无可用照片，可先用 `generatePortrait()` 生成单字占位头像（见 `philosophers.ts`）
