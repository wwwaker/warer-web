# Warer Web

简洁易用的科学计算器 —— 轻量上手，公式可视化，函数图像一键绘制，满足中学到大学的一般数学需求。

## 技术栈

- React 19 + TypeScript
- Vite 8
- Math.js（离线计算）
- KaTeX（公式渲染）
- function-plot（函数图像）
- Zustand（状态管理）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

浏览器访问终端输出的地址（默认 `http://localhost:5173`）。

### 3. 构建生产版本

```bash
npm run build
```

产物输出到 `dist/` 目录。

### 4. 预览生产构建

```bash
npm run preview
```

## 连接后端

默认后端地址为 `http://localhost:8000`。如需修改，编辑 `src/engine/cloudEngine.ts` 中的 `API_BASE` 常量。

## 项目结构

```
src/
├── components/        # UI 组件
│   ├── CalculatorTab  # 计算器主界面
│   ├── GraphTab       # 函数图像
│   ├── HistoryTab     # 历史记录
│   ├── Keyboard       # 科学键盘
│   └── KatexRenderer  # KaTeX 渲染器
├── engine/            # 计算引擎
│   ├── localEngine    # 离线计算（Math.js）
│   ├── cloudEngine    # 云端计算（API 调用）
│   ├── dispatcher     # 本地/云端决策路由
│   └── latexPreview   # 输入→LaTeX 转换
├── store/             # Zustand 状态管理
└── App.tsx            # 应用入口
```
