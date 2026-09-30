# 武直十 · 飞跃上海

Three.js + React + Vite 的 3D 飞行演示：驾驶武直-10 飞越程序化生成的上海（支持替换为外部 GLB 模型），白天 / 黑夜可切换；另有游戏装备风格的静态展示页（/armory）。

## 命令

```bash
npm install
npm run dev    # 本地开发
npm run build  # 类型检查 + 构建（tsc -b && vite build）
npm run lint   # ESLint
```

## 页面

- `/` 飞行页：驾驶武直-10 夜飞上海（可切白天），HUD 仪表盘、观赏模式。
- `/armory` 装备展示页：展台转盘静态展示 + 信息面板 + 扫码支付弹窗（假二维码占位，无真实支付逻辑）。页面文案在 `src/pages/armory-content.toml` 中编辑，保存即热更新。

两页可按 `B` 键快速互相切换。

## 操作

飞行页（/）：

| 按键 | 功能 |
|---|---|
| W / S | 加速 / 减速 |
| A / D | 转向 |
| ↑ / ↓ | 爬升 / 下降 |
| 空格 | 急停悬停 |
| M | 静音开关（**默认静音**） |
| V | 观赏模式：原地悬停，鼠标拖动环绕机身、滚轮缩放 |
| T | 白天 / 黑夜切换 |
| B | 进入装备展示页（/armory） |

装备展示页（/armory）：鼠标拖动环绕 / 滚轮缩放，`T` 白天 / 黑夜切换，`B` 返回飞行页。

## 外部模型（public/models/）

放入对应文件名即自动加载，失败回退程序化模型；浏览器控制台有 `[GLB]` 成功 / 失败日志：

- `z10.glb` 主角直升机（机头约定朝 -Z，不对改 `src/three/glb.ts` 的 `YAW_FIX`）
- `shanghai.glb` 城市沙盘（调参在 `glb.ts` 的 `SHANGHAI_GLB_TUNE`）
- `pearl.glb` / `shanghai-tower.glb` / `swfc.glb` / `jinmao.glb` 单件地标替换

详见 `public/models/README.md`。更多结构与维护备忘见 `AGENTS.md`。

## 部署（GitHub Pages）

线上地址：https://ignareo.github.io/FlyOverShanghai/ （装备展示页：/armory）

`vite.config.ts` 的 `base: './'` 是相对路径，适配 Pages 子路径部署；SPA 路由依赖 `dist/404.html`（构建后由 `index.html` 复制）兜底，直接刷新 /armory 也能正常加载。GLB 单文件均 < 100MB，GitHub 单文件限制内，无需 Git LFS（LFS 文件 Pages 只会拉到 pointer，反而有害，GLB 务必留在普通 git 里）。

**首次启用**：仓库 Settings → Pages → Source 选 `Deploy from a branch`，分支 `gh-pages`、目录 `/(root)`。

**更新部署**（构建产物单独放在 `gh-pages` 分支）：

```bash
npm run build && cd dist && cp index.html 404.html && \
git add -A && git commit -m "deploy: gh-pages build" && git push origin gh-pages
```

注意 `dist/` 是一个嵌套的独立 git 仓库（分支 `gh-pages`），已被根仓库 gitignore。
