# 基线报告 · 华夏城市生成器

采集时间：2026-11-20
采集对象：`http://127.0.0.1:5173/` 对应的 `main` 提交 `a7c4834`（接手时的线上版本）
采集环境：Playwright Chromium（无头，SwiftShader WebGL2），视口 1440 × 900，`#seed=20261119`。

## 1. 文件地图

| 文件 | 职责 | 本次要动的位置 |
| --- | --- | --- |
| `js/main.js` | 渲染器、状态、面板、种子、视角、hash | `SLIDERS`（13 参数与范围）、`readHash()`、`build()`、`applyNight()`、视角切换 |
| `js/context.js` | 构建上下文：`mat/facade/glow/box/instance/label/trafficPath` | 建筑与材质唯一入口；新增地形绑定、夜间地表材质、基础/挡土墙、四元数实例 |
| `js/terrain.js` | `Heightfield` + `heightAt()` + `distToPolyline()` | 建筑接地、坡度与台地都依赖它，不改接口 |
| `js/geom.js` | ribbon / 坡屋顶 / 拱桥 / 扭转塔 / 文字贴图 | 桥、屋顶、坡道的基础几何；复用 `hipRoofGeometry` |
| `js/environment.js` | 天空、太阳/月亮、雾、水面 shader、昼夜调色 | 夜间环境光、雾色/雾密度、水面反射、程序化环境反射 |
| `js/materials.js` | 程序化立面、玻璃、霓虹 / LED shader | 夜间立面、玻璃反射、LED 低频化 |
| `js/traffic.js` | 沿道路移动的车灯粒子 | 改为使用城市 RNG，保证同 seed 可复现 |
| `js/styles/chongqing.js` | 重庆地形、天际线、地标、灯光 | P0 / P1 的主要改动 |
| `js/styles/{lujiazui,xian,shenzhen,jiangnan}.js` | 其余四城 | 每城两条最扎眼问题 |
| `js/styles/shared.js` | 道路、街道网格、公园、桥等共享构件 | 道路夜间微弱自发光 |
| `js/rng.js` | 种子 RNG、噪声、插值 | 随机种子按钮改用 `crypto`，去掉 `Math.random()` |

## 2. 基线截图（15 张）

命令：

```powershell
$env:BASE_URL='http://127.0.0.1:5181/'; $env:OUT_DIR='shots/before'
$env:SCENES='tests/scenes/baseline.json'; node tests/realism-shots.mjs
```

每个城市：默认时间、白天 `time=0.18`、深夜 `time=0.95`。文件在 `shots/before/`（JPEG）。

| 城市 | 默认 | 白天 | 深夜 |
| --- | --- | --- | --- |
| 重庆 | `chongqing-default.jpg` | `chongqing-day.jpg` | `chongqing-night.jpg` |
| 陆家嘴 | `lujiazui-default.jpg` | `lujiazui-day.jpg` | `lujiazui-night.jpg` |
| 西安 | `xian-default.jpg` | `xian-day.jpg` | `xian-night.jpg` |
| 深圳 | `shenzhen-default.jpg` | `shenzhen-day.jpg` | `shenzhen-night.jpg` |
| 江南 | `jiangnan-default.jpg` | `jiangnan-day.jpg` | `jiangnan-night.jpg` |

## 3. 性能基线

`node tests/perf-baseline.mjs`（同一无头环境；`BASELINE-PERF.json` 为原始数据）。

| 城市 | 建筑数 | draw call | 三角形 | 首屏可交互（无头） |
| --- | ---: | ---: | ---: | ---: |
| 重庆 | 1,055 | 500 | 582,432 | 10.7 s |
| 陆家嘴 | 242 | 382 | 82,976 | 6.0 s |
| 西安 | 318 | 1,290 | 66,294 | 10.7 s |
| 深圳 | 551 | 492 | 162,148 | 8.0 s |
| 江南 | 216 | 2,606 | 92,432 | 10.9 s |

说明：

- 无头 Chromium 用 SwiftShader 软件渲染，FPS 只能作相对参考；draw call 与三角形数是与 GPU 无关的预算指标。
- 西安 / 江南的 draw call 严重超标（1,290 / 2,606），主要来自每栋房屋单独生成的屋顶、窗带和台阶；这是 P2「性能」的首要问题。
- 首屏时间包含无头环境下的 shader 编译，真实 GPU 上会短很多。

## 4. 接手时最严重的五个问题（排序）

1. **夜间地面全黑（P0-1）**：默认夜景下地形、江岸、路网不可见，只剩发光方盒；重庆默认 `time=0.9`、深圳 `0.94`。
2. **斜拉桥拉索白色扇形爆炸（P0-2）**：`chongqing.js` 用 `LineSegments + LineBasicMaterial` 画拉索，极细几何被 bloom 放大。
3. **建筑不接地、重庆没有高差（P0-3）**：城心是一块平坦台面，坡地上的楼有缝隙/半埋，默认视角是“平原 + 几个土包”。
4. **洪崖洞像发光电路板（P1-1）**：5×7 方盒 + 每层一条发光横条，无吊脚柱、无退台。
5. **李子坝 / 立交 / 江岸不可读（P1-2 / P1-3 / P1-4）**：轨道是细线、列车几乎看不见；立交三层环共面穿插、无盘旋；江面有来路不明的黑色方块（实为过简的船体），岸线没有阶梯驳岸。

## 5. 冻结契约与基线检查

- hash 参数名与范围、五个 `style.id`、默认种子 `20261119` 均未改动；新增能力只走内部 API，不新增 hash 参数（P2 光照参数除外，按需求追加）。
- 基线代码有两处违反「全项目禁止 `Math.random()`」：`context.js` 的实例 seed 兜底、`traffic.js` 的车流粒子；同 seed 时车流位置不可复现。已在 R1 一并修复为确定性随机。
- 基线控制台无 error（15 张基线截图采集时 `errors=none`）。
