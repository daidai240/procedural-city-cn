# Before / After 证据

所有图均为 1440 × 900、无头 Chromium（SwiftShader WebGL2）、同 seed `20261119` 的实机截图，
不是设计稿。`shots/before/` 是接手时 `main`（a7c4834）的五城 15 张基线；
`shots/r1` … `shots/r4` 是每轮对应项的改前 / 改后对照（`before/`、`after/` 各一份，JPEG）。

| 轮次 | 项 | 文件（`shots/rN/before|after/`） |
| --- | --- | --- |
| R1 | P0-1 夜间压黑 | `chongqing-default.jpg`（默认时间 0.9 → 0.66）、`chongqing-night-ground.jpg`（time=0.95，隐藏建筑只看地面） |
| R1 | P0-2 拉索白线 | `chongqing-bridge.jpg` |
| R1 | P0-3 接地 / 高差 | `chongqing-terrain.jpg` |
| R2 | P1-1 洪崖洞 | `chongqing-hongya.jpg` |
| R2 | P1-2 李子坝 | `chongqing-liziba.jpg`（改前为旧机位，改后为新机位） |
| R2 | P1-3 立交 | `chongqing-interchange.jpg` |
| R3 | P1-4 两江岸 | `chongqing-river.jpg` |
| R3 | 江南 | `jiangnan-lane.jpg` |
| R3 | 西安 | `xian-wall.jpg` |
| R4 | 深圳 | `shenzhen-bay.jpg` |
| R4 | 陆家嘴 | `lujiazui-bund.jpg` |

复现：

```powershell
# 接手版本（工作树之外的 baseline-main，端口 5181）
$env:BASE_URL='http://127.0.0.1:5181/'; $env:OUT_DIR='shots/evidence/before'
$env:PLAN_FILE='tests/scenes/ev-chongqing-before.json'; node tests/quick-shots.mjs
# 本分支（端口 5182）
$env:BASE_URL='http://127.0.0.1:5182/'; $env:OUT_DIR='shots/evidence/after'
$env:PLAN_FILE='tests/scenes/ev-chongqing-after.json'; node tests/quick-shots.mjs
# 用 tests/compress-shots.mjs 把 PNG 压成 JPEG 后放入 rN/before|after
```

夜间地面亮度的量化：

```powershell
node tests/measure-ground.mjs shots/r1/before/chongqing-night-ground.jpg shots/r1/after/chongqing-night-ground.jpg
```

注意：无头 SwiftShader 的 FPS 不能代表真实 GPU；draw call / 三角形数是可比的工程指标，
见 `docs/ROUNDS.md` 与 `BASELINE.md`。
