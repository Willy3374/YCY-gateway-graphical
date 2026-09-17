# YCY-gateway-graphical

**役次元 · 积木编辑器** — 面向 RK3308H 物联网网关的图形化编程界面。

用户在浏览器里拖拽积木搭出逻辑，点击「生成」即可编译成一份自定义逻辑 JSON；
该 JSON 由网关板载的 **C 解释器** 读取执行，通过 **蓝牙** 调用外设
（智能锁 / 电击器 / 灌肠机 / 跳蛋 / 榨精机），并读取设备回传的参数
（如电击器角速度、加速度、角度，智能锁开关状态）驱动条件分支。

纯前端零依赖：单个 `index.html` + 原生 JS/CSS，不需要构建步骤。

---

## 1. 运行架构

```
浏览器（本仓库：积木画布 + 编译引擎）
        │  ① 拖拽积木 → 生成 logic JSON
        │  ② 保存 / 下发（POST /api/save 或直接写入）
        ▼
RK3308H 网关（Linux + 板载 C 解释器）
        │  ③ 解释执行 JSON 中的指令序列
        ▼
蓝牙外设 ── 控制指令下发（强度 / 频率 / 通道 / 状态）
        └── 参数回传（角度、角速度、加速度、锁状态 …）
```

关键设计约束（所有改动都要遵守）：

- **JSON 是唯一契约。** 前端不直接操作硬件，只产出 JSON；解释器只认 JSON。
  两端解耦，前端可以完全离线开发。
- **opcode 只能来自积木库。** 引擎遇到未定义的 opcode 直接抛错，禁止杜撰。
- **产物落在 `index.html` 同目录。** 网关直接读取该目录，无需额外搬运。

## 2. 目录结构

| 路径 | 作用 |
| --- | --- |
| `index.html` | 页面骨架：顶栏 + 三栏布局（积木库 / 画布 / 连接状态）+ 3 个弹层；`<head>` 内联脚本做首屏防闪烁 |
| `css/style.css` | 全部样式，CSS 变量驱动主题（深色为 `:root` 默认，浅色走 `[data-theme="light"]`） |
| `js/blocks.js` | **积木库唯一数据源**：41 个 opcode 的分类、参数定义、槽位兼容规则 |
| `js/engine.js` | 编译引擎 `GP.toSpec`：画布状态 → 逻辑 JSON，并收集告警 |
| `js/workspace.js` | 画布状态机、渲染、拖拽命中判定、导入导出 |
| `js/examples.js` | 内置示例工程「电击器脉冲」 |
| `js/device.js` | 右侧连接状态栏（离线 / 连接中 / 在线 / 异常 + 设备列表） |
| `js/theme.js` | 外观三态：跟随系统 / 浅色 / 深色 |
| `js/main.js` | 页面装配：工具栏、命名保存、JSON 输出面板、校验 |
| `tools/serve.js` | 零依赖静态服务器 + `/api/save`（真写盘）+ `/api/list` |
| `tools/*.js` | 自检脚本（见 §7） |
| `前端设计.md` | 积木规范与输出格式的需求原文（opcode 的定义依据） |
| `memory/YYYY-MM-DD.md` | 开发日志：本轮改动、踩过的坑、验证习惯 |

## 3. 快速开始

**方式 A：直接打开**

双击 `index.html` 即可使用全部编辑与生成功能。
保存时会自动降级：`showSaveFilePicker`（另存为对话框）→ 浏览器下载。

**方式 B：本地服务器（推荐，可真正写盘）**

```bash
node tools/serve.js 4317
# → http://127.0.0.1:4317/
# → 保存目录: <项目根>
```

- 端口可用参数或 `PORT` 覆盖；产物目录用环境变量 `GP_OUT_DIR` 覆盖。
- 页面 `fetch('/api/save')` 成功 → 文件真正写入 `index.html` 同目录（网关可直接读取）。
- `fetch` 失败（`file://` 打开或无服务器）→ 自动回退到浏览器另存为 / 下载，用户始终拿得到文件。

## 4. 积木库（9 分类 / 41 opcode）

分类与颜色见 `GP.CATS`，积木定义见 `js/blocks.js`。

| 分类 | opcode |
| --- | --- |
| 事件 `event` | `when_start`、`when_true` |
| 控制 `control` | `wait_seconds`、`wait_until`、`if_then`、`if_then_else`、`repeat_forever`、`repeat_times`、`break_loop` |
| 设备 · 智能锁 `device_lock` | `lock_set` |
| 设备 · 电击器 `device_tens` | `tens_channel_set`、`tens_all_off` |
| 设备 · 灌肠机 `device_enema` | `enema_expand`、`enema_pause`、`enema_run` |
| 设备 · 跳蛋 `device_vibe_a` | `vibe_a_intensity`、`vibe_a_frequency` |
| 设备 · 榨精机 `device_vibe_b` | `vibe_b_intensity`、`vibe_b_frequency` |
| 运算 / 判断 `operator` | `op_add`、`op_sub`、`op_mul`、`op_div`、`op_random`、`op_math`、`logic_and`、`logic_or`、`logic_not`、`cmp_eq`、`cmp_gt`、`cmp_lt`、`cmp_ge`、`cmp_le` |
| 值 / 变量 `value` | `val_time`、`var_define`、`var_set`、`var_add`、`lock_state`、`tens_omega`、`tens_alpha`、`tens_angle` |

按形态分：事件帽 2、C 形容器 4、内联报告块 19、普通语句 16。

参数类型：`number` | `string` | `boolean` | `enum` | `variable` | `condition_block` | `statement_block`
（另有仅界面使用的 `flag`，不进入 JSON）。

### 积木行为约定

- **事件积木只能放顶层，且各自开启一条新链。**
  事件块只有 `when_start` / `when_true` 两种，**总数最少 1、最多 2（任意组合）**。
  超限时工具箱拖出 / 双击追加会被阻止并提示「事件积木最多 2 个…」。
- 数字槽只接受 `returns: "number"`；条件槽只接受 `returns: "boolean"`，类型不符不落槽。
- 条件 / 运算 / 值积木**不单独成块**，只作为内联对象嵌入到 `inputs`；单独作为顶层语句会被校验拦截。
- 未填参数走定义里的 `default`；ID 默认 `1`，强度默认 `0`，时间默认 `1` 秒。
- 空条件槽：`when_true` 的条件为空会**校验失败**并提示（不再自动填充占位条件）——条件是真实语义的一部分，不静默补。
- **画布自由摆放：** 积木按拖入位置落位，不强制自动排列；两个事件块可独立摆放，各自开链。
- **拖入左侧选择栏删除：** 画布积木拖到左侧工具箱上方释放即删除（含下级堆叠一并移除），工具箱高亮「松手删除」提示；从工具箱拖出创建不受影响。
- **数学合理性校验：** 除数非 0；`ln`/`log` 参数 > 0；`asin`/`acos` 参数在 [-1,1]；`tan` 不取 90°+k·180°。只检查字面量参数，嵌套积木的值运行期才知道不在此判。

## 5. 逻辑 JSON 格式

```json
{
  "version": "1.0",
  "program": [
    {
      "opcode": "when_start",
      "id": "blk_1",
      "next": {
        "opcode": "repeat_times",
        "id": "blk_2",
        "inputs": { "N": 10 },
        "body": [
          { "opcode": "tens_channel_set", "id": "blk_3", "inputs": { "ID": 1, "CH": "A", "N": 50 } },
          { "opcode": "wait_seconds", "id": "blk_4", "inputs": { "N": 1, "UNIT": "秒" } }
        ]
      }
    },
    {
      "opcode": "when_true",
      "id": "blk_5",
      "inputs": { "COND": { "opcode": "cmp_gt", "inputs": { "A": 5, "B": 0 }, "returns": "boolean" } },
      "next": { "opcode": "lock_set", "id": "blk_6", "inputs": { "ID": 1, "STATE": "开锁" } }
    }
  ],
  "variables": {}
}
```

结构规则：

- **线性顺序用 `next`（对象）串联**；`program` 的每一项都是一条以事件积木开头的链。
- **并行任务 = `program` 数组的多条链**。事件块总数 1-2，任意组合（两个 `when_start` / 两个 `when_true` / 各一个）。
  C 解释器需**逐条链独立执行**（并发或轮询调度均可），链与链之间互不依赖。
- **嵌套容器用 `body` / `else`（数组）**：`if_then` / `if_then_else` / `repeat_forever` / `repeat_times`。
- **内联报告块**放在 `inputs.<参数名>` 里，自身带 `opcode` / `inputs`，条件与运算类再带 `returns`。
- `variables` 为程序里出现过的自定义变量名 → 初值映射。
- 设备状态类积木（`tens_omega` 等）在运行期由蓝牙回传数据填充，前端只负责生成取值节点。
- `when_true` 的条件在 `inputs.COND`，**必须存在且非占位**，否则前端校验直接拦下。

`js/examples.js` 里的示例与「生成」输出结构完全一致，可直接导入、回编译，
`tools/example.test.js` 断言了这条往返路径的结构一致性。

## 6. 界面功能

- **拖拽**：从左侧积木库拖到画布。线性连接用上下顺排；条件 / 运算积木拖到虚线插槽；`✕` 删除；双击库中积木追加到画布。
  积木按拖入位置落位，不强制自动排列；事件块可独立摆放。
  **拖到左侧工具箱上方释放 = 删除该积木**（含下级堆叠一并移除），工具箱高亮提示「松手删除」；从工具箱拖出创建不受影响。
- **事件块上限**：`when_start` / `when_true` 合计 1-2 个；已有 2 个时拖出 / 双击追加被阻止并提示；删除后可为 0，但校验会失败。
- **生成 ▶**：校验 → 编译 → 弹命名窗（默认名 = 当前时间 `YYYYMMDDHHmm`）→ 确认后保存并展示 JSON。**校验失败时阻止生成**并给出可定位的中文提示。
- **开始**：下发入口。**校验失败时阻止下发**；未连接时弹「未连接到网关」，按连接状态提示。真实下发逻辑预留在 `main.js` 的 `openStartDialog()`。
- **校验**：编译并检查结构，报告顶层链是否以事件积木开头、自动填充处数。规则见 §5.1。
- **导入 / 导出**：导入 JSON 文件、复制 JSON、下载 `logic.json`。
- **连接状态栏**：离线 / 连接中 / 在线 / 异常四态 + 设备列表；标签页标题会加 `●` 前缀提示离线。
- **外观**：跟随系统 / 浅色 / 深色，写入 `localStorage('gp-theme')`，跟随系统时响应系统主题变化并跨标签页同步。

### 5.1 校验规则（`GP.validate`，`js/engine.js`）

全部必要校验；失败时 toast 首个错误并展示全部错误（含积木 uid / opcode，可定位）：

| # | 规则 | 错误码 | 提示要点 |
| --- | --- | --- | --- |
| a | 至少 1 个事件积木 | `no_event` | 缺少「当开始被点击」或「当条件为真」 |
| b | 事件积木总数 <= 2 | `too_many_events` | 任意组合均可，总数不超 2 |
| c | 事件之前不得有顶层语句 | `orphan_top` | 积木未接入任何事件任务 |
| d | `when_true` 条件必须存在且非占位 | `cond_missing` | 条件槽为空 |
| e | 运算 / 判断不能单独作语句 | `reporter_statement` | 需拖到输入插槽 |
| f | 事件不能嵌进 body / else | `hat_nested` | 事件只能放顶层 |
| g | 槽位类型匹配 + opcode 在积木库内 | `slot_type` / `unknown_op` | 条件槽收 boolean，数值槽收 number |
| h | 除数非 0；`ln`/`log` 参数 > 0；`asin`/`acos` ∈ [-1,1]；`tan` ≠ 90°+k·180° | `math_*_domain` | 只查字面量参数 |

画布变化（拖拽删除 / 新增 / 清空）后自动**静默校验**刷新提示；生成 / 开始前**强制校验**，失败即阻止。

## 7. 自检

改动后请全量跑一遍（本项目的既有习惯）：

```bash
node --check js/blocks.js js/engine.js js/workspace.js js/main.js js/device.js js/theme.js js/examples.js tools/serve.js
node tools/smoke.js          # 引擎自检：复杂工程编译 + 告警
node tools/order.test.js     # 画布顺序 / 顶层链顺序 / body 顺序
node tools/dom.drag.test.js  # 最小 DOM 桩驱动真实 handleDrop 路径
node tools/example.test.js   # 示例 JSON → 积木 → JSON 结构一致
node tools/validate.test.js  # 校验规则：事件数量 / 孤立 / 条件 / 槽位 / 数学定义域
node tools/delete.test.js    # 拖入工具箱删除 + 事件上限（最小 DOM 桩驱动真实路径）
node tools/device.test.js    # 连接状态栏（含轮询、探活失败、监听不重复绑定）
node tools/check-markup.js   # 页面元素 id / 脚本加载顺序 / 结构约定
node tools/check-served.js   # 服务器实际返回字节（需先起 serve.js）
```

`tools/check-served.js` 依赖运行中的服务器（默认 `http://127.0.0.1:4317`，可用 `GP_BASE` 覆盖）。
`tools/make-dark-logo.ps1` 用于重新生成深色主题 logo（反色 + 色相旋转 + 白底转透明）。

**验证要求：** 修 bug 时把旧逻辑放进临时副本跑同一套测试，确认测试确实能抓住该 bug（避免写出永远绿的测试）。
测试里若起了定时器 / 轮询，必须清理，否则进程不退出、留下僵尸进程。

## 8. 接入网关（当前缺口）

- **连接状态栏接真机**：在 `js/main.js` 的 `initDevice()` 里传入探活函数并打开轮询：
  `GPDevice.init({ probe: () => fetch('/api/device'), pollMs: 5000 })`。
  `probe` 返回 `{ connected, title, devices: [{ name, meta, online }] }`。
- **「开始」真实下发**：把 `openStartDialog()` 中的占位提示替换为下发接口调用。
  `GPDevice.setState('connecting' | 'connected' | 'error', subText)` 可直接驱动状态栏。
- **网关侧 C 解释器**：需要按 §5 的结构实现 `next` / `body` / `else` 遍历与内联表达式求值，
  并负责蓝牙连接、指令下发与状态回传。
  **并行任务**：`program` 数组可能有 1-2 条链（事件块 1-2 个），需逐条链独立执行（并发或轮询调度均可），
  链与链之间互不依赖；`when_true` 链的语义是「条件持续为真期间反复触发其 `next` 链」或由网关自行约定，需与前端同步。

## 9. 开发约定

- **opcode 不得杜撰**：新增积木先在 `js/blocks.js` 定义，再同步 `前端设计.md` 与本文档的积木表。
- **`js/blocks.js` 是唯一数据源**：面板渲染与引擎转换都读它，不要在别处硬编码 opcode 或参数。
- **只改必要文件**，保持零依赖、无构建步骤。
- **踩过的坑（改动时注意）**：
  - 顶层画布的列表容器就是 `#canvas` 本身（`listEl === null`），求插入位置必须回退到根元素，
    否则索引恒为 0、拖进去的顺序会反。
  - 导入时整条主链靠 `next` 串联，必须沿 `next` 展开（已带 5000 深度环保护），只读 `body`/`else` 会丢块。
  - 模块级事件监听只绑一次（`device.js` 用 `refreshBound` 守卫），重复 `init` 会叠加监听。
  - 验证逻辑写成 `tools/*.js` 文件再跑，不要用内联 `node -e`（中文与引号在 Windows 控制台会被编码搞崩）。
  - 新增静态资源类型要同步 `tools/serve.js` 的 `MIME` 表，否则会以 `octet-stream` 下发。

## 10. 维护本文档

README 是交付物的一部分。**后续每次优化 / 新增积木 / 调整 JSON 结构 / 改动保存与下发方式，
都必须同步更新本文档对应章节**（积木表、格式规范、自检命令、接入缺口），
保持文档与代码一致，不留下过期描述。
