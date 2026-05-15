# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [v0.2.2]

### Features

- **history**: 新增历史记录分类筛选（全部/计算/绘图），日期分组展示
- **history**: 新增绘图历史记录，计算器📈绘图、绘图卡片添加/编辑函数时自动记录
- **history**: 绘图历史条目显示颜色点、函数类型标记和表达式
- **store**: 新增 `addGraphHistory` 和 `applyGraphFromHistory` 方法

### Changed

- **store**: 历史记录数据结构重构，条目包含 `type`（calculation/graph）和 `timestamp`
- **store**: `navigateHistory` 过滤为仅计算条目，箭头键不跳绘图记录
- **calculator**: `handlePlot` 重构，消除多个 return 路径
- **graph**: 绘图卡片添加/编辑/示例函数时写入历史记录

### Fixed

- **graph**: 绘图操作此前不记入历史，现已修复

## [v0.2.1]

### Fixes

- **cloudEngine**: 添加 HTTP 状态码检查，防止非 2xx 响应导致解析崩溃
- **graph**: 移除重复 `useEffect`，修复函数列表变化时渲染两次的问题
- **history**: 移除 `HistoryTab` 组件中未使用的 `tab` prop
- **store**: 移除未在接口中声明且未使用的 `getColumnActiveCard` 方法
- **store**: 修复 `setActiveCard` 在 `id` 为 `null` 时的类型错误
- **store**: 修复 `removeCard` 和 `moveCard` 未正确更新每栏独立 `activeCardId` 的问题
- **store**: 修复 `loadHistoryItem` 未正确将历史记录加载到当前栏的问题

### Refactor

- **index.css**: 移除与 `App.css` 完全重复的样式定义
- **all**: 清理所有前端源文件中的不必要中文注释
- **graph**: 替换 `as any` 类型断言为更安全的 `Record<string, unknown>` 断言
- **localEngine**: 为空 `catch` 块添加注释，满足 lint 规则
- **keyboard**: 调整 `0` 和 `=` 按键布局，新增 `,` 键

## [v0.2.0]

### Features

- **backend**: 新增 `solve()` 解方程命令，支持多项式和超越方程
- **graph**: 新增极坐标/参数方程/隐式方程三种绘图模式，每函数独立类型支持混合绘制
- **graph**: 新增极坐标网格 SVG 叠加（支持缩放/平移追踪）
- **graph**: FnTag 显示类型徽章（y/r/P/f）
- **calculator**: 新增常用数学模板面板（求根/求导/积分/化简等）
- **calculator**: 计算器→图像路由支持显式表示法（`y()`/`r()`/`t()`/`f()`）+ 智能检测
- **engine**: 新增 `graphDetection.ts` 共享方程类型检测工具
- **keyboard**: 替换 `simp` 为 `θ`，新增 `t` 按钮

### Fixes

- **graph**: 修复隐式方程使用错误 `graphType`（`polyline`→`interval`）导致绘制失败
- **graph**: 修复极坐标 `r=` 前缀未剥离导致的解析错误
- **backend**: 增加 30s 计算超时防止卡死
- **backend**: 嵌套命令（如 `diff(solve(...))`）返回清晰错误信息

### Refactor

- **graph**: 移除 Card 级别 `graphMode`，每 `GraphFn` 携带独立 `fnType`

## [v0.1.2]

### Features

- **history**: 添加历史记录搜索功能
- **components**: 添加历史记录搜索功能并优化多个组件

### Refactor

- **engine**: 优化本地计算引擎的智能舍入功能
- **App**: 优化状态管理性能

### Fixes

- **graph**: 修复无函数时的渲染逻辑

### Style

- **keyboard**: 增加按键触控反馈效果

### Performance

- **latex**: 优化LaTeX预览的解析逻辑

## [v0.1.1]

### Features

- **calculator**: 完善函数绘图功能并增强计算器交互
- **graph**: 添加函数绘图功能，支持多函数显示与交互
- **engine**: 优化本地计算引擎，支持隐式乘法解析

### Refactor

- **calculator**: 重构输入处理逻辑以支持光标定位

### Fixes

- **ui**: 修复布局和样式问题，提升用户体验

### Style

- 清理无用代码并优化样式结构

## [v0.1.0]

### Features

- 初始版本发布
- 基础计算器功能
- 函数绘图基础功能