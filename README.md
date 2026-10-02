# Hakka Field Assistant

面向客家话田野调查的离线优先 MVP（React + TypeScript + Vite）。

## 当前可用场景（内置模板）

- 主场景：**客家话连读变调**
- 次场景：**小称变调**

> 内置条目为“研究模板（可编辑）”，用于采录工作流，不预设具体客家方言结论。

## 核心流程

1. 新建项目时必须选择调查场景。
2. 系统自动加载该场景模板条目（不需要手动新增条目）。
3. 添加发音人，选择条目后开始录音。
4. 每条可多次采录，标记“有效/重录”，并查看总进度（总数、已录、有效、重录、待采录）。
5. 可“重载模板（保留录音）”刷新条目内容。
6. 导出 ZIP（`audio/*.wav` + `recordings.csv` + `project.json`）。

## 资源管理概览原型（前端展示）

- 顶部可切换：`调查工作台` / `资源管理概览`
- 在 `资源管理概览` 中可切换三个模块：
  - 场景管理（连读变调 / 小称变调 / 单字调 + 新增场景占位入口）
  - 方言点管理（方言点清单 + 地图概览原型占位）
  - 项目管理（方言点 + 调查场景项目卡片、录音进度、WAV/Praat 状态、导出占位按钮）
- 原型使用本地 mock 数据，仅用于展示未来“方言资源调查工作台”的信息架构。

### 明确非功能范围（当前不实现）

- 不接入后端 API / 数据库迁移
- 不接入真实地图 SDK 或在线地图服务
- 不接入 DeepSeek 或其他大模型接口
- 不实现完整业务逻辑（新增场景、导出项目按钮在概览页仅为占位交互）
- 不修改现有调查模板内容与录音工作流

## 音频格式（Praat 兼容）

- 格式：**WAV (RIFF/WAVE PCM 16-bit, mono)**
- 采样率：浏览器 AudioContext（优先 48kHz，设备环境下可能为 44.1kHz）
- 录音完全本地处理，不依赖 AI 或网络
- 音频 Blob 存在 IndexedDB，避免 localStorage 容量导致音频丢失

## 导出内容

- `audio/*.wav`：稳定 ASCII 安全文件名，便于外部工具处理
- `recordings.csv`：项目、场景、条目、发音人、take/status、时间戳、文件名、备注
- `project.json`：元数据导出（不内嵌大体积音频 data URL）

## Praat 使用步骤（手动）

1. 解压导出的 ZIP。
2. 在 Praat 中选择 `Open > Read from file...`，打开 `audio/` 下的 `.wav` 文件。
3. 在 Objects 窗口选中 Sound，点 `View & Edit` 查看 waveform 与 spectrogram（语图）。
4. 如需标注，使用 `Annotate > To TextGrid...` 新建 TextGrid（本项目不自动生成 TextGrid）。
5. 在编辑器中完成切分与标注后，`File > Write TextGrid to text file...` 保存。

## 已知限制

- 模板条目为研究起始清单，正式调查需按课题组规范继续校订。
- 不含自动语音识别、自动变调判断、自动 TextGrid 生成。
- 录音依赖浏览器麦克风权限；权限拒绝会显示中文错误提示。

## 开发

```bash
npm install
npm run lint
npm run build
npm run dev
```
