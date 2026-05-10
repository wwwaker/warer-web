# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
- **graph**: 极坐标默认范围从 `[-π, π]` 扩至 `[-4π, 4π]` 使螺旋线可见
- **graph**: 切换绘图模式不再清空已添加函数
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