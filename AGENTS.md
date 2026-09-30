# 武直十 · 飞跃上海

Three.js + React + Vite 的 3D 飞行演示：驾驶武直-10 飞越程序化生成的上海（支持替换为外部 GLB 模型），白天 / 黑夜可切换。

## 常用命令

- `npm run dev` 本地开发
- `npm run build` 类型检查 + 构建（tsc -b && vite build）
- `npm run lint` ESLint

## 结构

- `src/three/engine.ts` 飞行引擎主循环：飞行物理、追尾相机、HUD 上报、昼夜切换、观赏模式
- `src/three/city.ts` 程序化城市：黄浦江（`riverX`）、街区楼宇、陆家嘴地标、外滩、南浦大桥
- `src/three/helicopter.ts` 程序化武直-10 + 可复用旋翼组件（主旋翼 5 叶 / 尾旋翼 4 叶 / 残影盘）
- `src/three/glb.ts` 外部 GLB 适配层：加载、归一化、旋翼识别、城市沙盘对齐
- `src/three/textures.ts` Canvas 程序化贴图（窗灯、水面、文字、旋翼残影）
- `src/three/showcase.ts` 装备展示页轻量渲染器：深色展台 + 网格地板 + 缓慢转盘（20s/圈，拖动时暂停，旋翼静止），自带 `setDayMode()` 昼夜切换，与飞行引擎完全独立
- `src/App.tsx` 路由（`/` 飞行页、`/armory` 装备展示页，`HashRouter` 定义在 `src/main.tsx`）+ 飞行页 HUD 界面与操作说明
- `src/pages/Armory.tsx` 装备展示页：3D 视口 + 信息面板 + 扫码支付弹窗（假二维码占位，无真实支付逻辑）
- `src/pages/armory-content.toml` 展示页文案配置（名称 / 星级 / 价格 / 预留区 reserved / 详细介绍 details），保存即热更新
- `public/models/README.md` 外部模型导入位的详细说明

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

机型切换：右上角「机型」下拉（`App.tsx` 的 `MODEL_OPTIONS` 配置项），走 `engine.setHelicopter(url)` 热替换机身，文件缺失自动回退程序化模型。

装备展示页（/armory）：鼠标拖动环绕 / 滚轮缩放，`T` 白天 / 黑夜切换，`B` 返回飞行页。

## 外部模型（public/models/）

放入对应文件名即自动加载，失败回退程序化模型；浏览器控制台有 `[GLB]` 成功 / 失败日志。

- `z10.glb` 主角直升机。机头约定朝 -Z，不对改 `glb.ts` 的 `YAW_FIX`。旋翼识别：先按节点名（rotor/blade 等），失败再按几何特征（顶部扁平大盘 = 主旋翼，尾部竖直薄盘 = 尾旋翼），识别到的网格经 `repivot()` 绕自身中心自转；都失败则挂程序化旋翼。
- `shanghai.glb` 城市沙盘（Sketchfab「City- Shanghai-Sandboxie」）。调参在 `glb.ts` 的 `SHANGHAI_GLB_TUNE`（当前 scale=800、offsetY=-9.8、offset=(420,0)）。注意：它是**风格化沙盘而非真实比例**，内部地理与程序化地图无法严格对齐。
- `pearl.glb` / `shanghai-tower.glb` / `swfc.glb` / `jinmao.glb` 单件地标替换。

## 维护备忘（改动时容易踩的坑）

- **模型河道对齐**：`city.ts` 的 `MODEL_RIVER` 控制点让黄浦江中心线贴合 shanghai.glb 的河道，是在当前 `SHANGHAI_GLB_TUNE` 下实测的。**改了 TUNE 的 scale / rotY / offset 必须同步重测这些控制点**；`city.ts` 的核心区空位（`CORE_X0..CORE_Z1`）也是按 scale=800 的模型占地留的。
- **昼夜切换**：飞行页 `engine.setDayMode()`。天空 / 雾 / 灯光 / 星空 / 探照灯在其中调整；地面与南浦大桥的深色材质经 `CityRefs` 的材质引用单独调色；所有自发光材质（窗灯等）自动按 `material.userData.em0` 记录的原值缩放，新增自发光材质无需登记。展示页另有独立的 `showcase.setDayMode()`（天空 / 雾 / 三点布光 / 环绕点光 / 展台光环），两处互不影响。
- **模型自带的缩放陷阱**：GLB 内部可能带缩放节点（如 z10 归一化后场景根缩放约 0.03），往模型节点树里挂东西（如残影盘）会被连带缩小——应挂到未缩放的外层组上，参考 `loadHelicopterGLB` 中 disc 的挂法。
