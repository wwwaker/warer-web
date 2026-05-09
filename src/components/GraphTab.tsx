import { useEffect, useRef, useCallback, useState } from 'react';
import { useCalculator, type Card, type GraphFn, COLORS } from '../store/calculatorStore';

type FpInstance = ((opts: Record<string, unknown>) => unknown) & { Chart?: { cache: Record<string, unknown> } };

let fpModuleCache: FpInstance | null = null;
let fpModuleLoading = false;
const fpModuleReadyCallbacks: Set<(fp: FpInstance | null) => void> = new Set();

function loadFpModule(): Promise<FpInstance | null> {
  if (fpModuleCache) return Promise.resolve(fpModuleCache);
  if (fpModuleLoading) {
    return new Promise<FpInstance | null>((resolve) => {
      fpModuleReadyCallbacks.add(resolve);
    });
  }
  fpModuleLoading = true;
  return import('function-plot').then((mod) => {
    const raw = mod.default || mod;
    const fn = (raw as unknown as Record<string, unknown>).default || raw;
    if (typeof fn === 'function') {
      fpModuleCache = fn as FpInstance;
    }
    fpModuleLoading = false;
    fpModuleReadyCallbacks.forEach((cb) => cb(fpModuleCache));
    fpModuleReadyCallbacks.clear();
    return fpModuleCache;
  }).catch(() => {
    fpModuleLoading = false;
    fpModuleReadyCallbacks.forEach((cb) => cb(null));
    fpModuleReadyCallbacks.clear();
    return null;
  });
}

loadFpModule();

const GRAPH_FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'sqrt', 'abs',
  'log', 'log2', 'log10', 'exp', 'ceil', 'floor', 'round',
  'sign', 'cbrt', 'nthRoot', 'factorial',
  'ln',
]);

function parseExprForGraph(expr: string): string {
  let s = expr.replace(/^[yY]\s*=\s*/, '').trim();
  if (!s) return '0';

  s = s.replace(/\|([^|]+)\|/g, 'abs($1)');
  s = s.replace(/\bln\b/gi, 'log');
  s = s.replace(/\bpi\b/gi, 'PI');

  const tokens: { type: 'func' | 'var' | 'num' | 'op' | 'lparen' | 'rparen'; value: string }[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (/[a-zA-Z]/.test(ch)) {
      let name = '';
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) { name += s[i++]; }
      if (GRAPH_FUNCS.has(name)) {
        tokens.push({ type: 'func', value: name });
      } else if (name === 'e') {
        tokens.push({ type: 'var', value: 'E' });
      } else {
        tokens.push({ type: 'var', value: name });
      }
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i++]; }
      tokens.push({ type: 'num', value: num });
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    tokens.push({ type: 'op', value: ch }); i++;
  }

  const result: string[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const cur = tokens[j];
    const prev = j > 0 ? tokens[j - 1] : null;

    if (prev) {
      const needMul =
        (prev.type === 'num' && (cur.type === 'var' || cur.type === 'lparen' || cur.type === 'func')) ||
        (prev.type === 'rparen' && (cur.type === 'var' || cur.type === 'num' || cur.type === 'lparen' || cur.type === 'func')) ||
        (prev.type === 'var' && cur.type === 'lparen');
      if (needMul) result.push('*');
    }

    if (cur.type === 'func' && cur.value === 'ln') {
      result.push('log');
    } else {
      result.push(cur.value);
    }
  }

  return result.join('');
}

function evalExpr(parsedExpr: string, x: number): number | null {
  try {
    const fn = new Function('x', ...Object.keys(Math), `with(Math){return(${parsedExpr})}`);
    const result = fn(x);
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function validateExpr(expr: string): boolean {
  try {
    const parsed = parseExprForGraph(expr);
    const result = evalExpr(parsed, 1);
    return result !== null;
  } catch {
    return false;
  }
}

interface AxisRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const DEFAULT_RANGE: AxisRange = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

const rangeCache = new Map<string, AxisRange>();

function lerpRange(from: AxisRange, to: AxisRange, t: number): AxisRange {
  return {
    xMin: from.xMin + (to.xMin - from.xMin) * t,
    xMax: from.xMax + (to.xMax - from.xMax) * t,
    yMin: from.yMin + (to.yMin - from.yMin) * t,
    yMax: from.yMax + (to.yMax - from.yMax) * t,
  };
}

function adjustAspectRatio(range: AxisRange, width: number, height: number): AxisRange {
  // 保持 X/Y 轴的单位长度在视觉上相等（即 y=x 的斜率为 45°）
  const xRange = range.xMax - range.xMin;
  const yRange = range.yMax - range.yMin;
  
  // 计算当前容器的宽高比
  const containerRatio = width / height;
  // 计算数据范围的宽高比
  const dataRatio = xRange / yRange;
  
  // 如果数据范围的比例与容器比例不匹配，需要扩展其中一个轴
  if (dataRatio > containerRatio) {
    // X 轴相对更长，需要扩展 Y 轴范围
    const newYRange = xRange / containerRatio;
    const yCenter = (range.yMin + range.yMax) / 2;
    return {
      ...range,
      yMin: yCenter - newYRange / 2,
      yMax: yCenter + newYRange / 2
    };
  } else {
    // Y 轴相对更长，需要扩展 X 轴范围
    const newXRange = yRange * containerRatio;
    const xCenter = (range.xMin + range.xMax) / 2;
    return {
      ...range,
      xMin: xCenter - newXRange / 2,
      xMax: xCenter + newXRange / 2
    };
  }
}

interface Props {
  card: Card;
}

function FnTag({ fn, cardId }: { fn: GraphFn; cardId: string }) {
  const { removeGraphFn, updateGraphFn, toggleGraphFnVisibility } = useCalculator();
  const [editing, setEditing] = useState(false);
  const [editExpr, setEditExpr] = useState(fn.expr);
  const [showColors, setShowColors] = useState(false);

  const startEdit = () => {
    setEditExpr(fn.expr);
    setEditing(true);
  };

  const finishEdit = () => {
    const trimmed = editExpr.trim().replace(/^y\s*=\s*/i, '');
    if (trimmed && trimmed !== fn.expr) {
      updateGraphFn(cardId, fn.id, { expr: trimmed });
    }
    setEditing(false);
  };

  return (
    <span className={`graph-fn-tag${fn.hidden ? ' hidden-fn' : ''}`} style={{ background: fn.color + '14' }}>
      <button
        className="graph-fn-color-dot"
        style={{ background: fn.color, opacity: fn.hidden ? 0.4 : 1 }}
        onClick={() => setShowColors(!showColors)}
        title="更改颜色"
      />
      {showColors && (
        <span className="graph-fn-color-picker">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`graph-fn-color-opt${c === fn.color ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => { updateGraphFn(cardId, fn.id, { color: c }); setShowColors(false); }}
            />
          ))}
        </span>
      )}
      {editing ? (
        <input
          className="graph-fn-edit-input"
          value={editExpr}
          onChange={(e) => setEditExpr(e.target.value)}
          onBlur={finishEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          spellCheck={false}
        />
      ) : (
        <span className="graph-fn-expr" onDoubleClick={startEdit} title="双击编辑" style={{ opacity: fn.hidden ? 0.5 : 1 }}>{fn.expr}</span>
      )}
      <button className="graph-fn-toggle" onClick={() => toggleGraphFnVisibility(cardId, fn.id)} title={fn.hidden ? '显示' : '隐藏'}>{fn.hidden ? '👁' : '👁‍🗨'}</button>
      <button className="graph-fn-remove" onClick={() => removeGraphFn(cardId, fn.id)}>×</button>
    </span>
  );
}

const EXAMPLE_EXPRS = ['x^2', 'sin(x)', 'cos(x)', 'log(x)', 'sqrt(x)', 'e^x', '1/x', 'x^3 - 3x'];

export default function GraphTab({ card }: Props) {
  const { addGraphFn, clearGraphFns } = useCalculator();
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<number>(0);
  const [inputExpr, setInputExpr] = useState('');
  const [renderError, setRenderError] = useState<string | null>(null);

  const [axisRange, setAxisRange] = useState<AxisRange>(() => rangeCache.get(card.id) ?? { ...DEFAULT_RANGE });
  const rangeRef = useRef<AxisRange>(axisRange);
  const fpInstanceRef = useRef<Record<string, unknown> | null>(null);
  const animRef = useRef<number>(0);
  const [showRangePanel, setShowRangePanel] = useState(false);
  const [rangeInput, setRangeInput] = useState<AxisRange>({ ...DEFAULT_RANGE });

  const [mouseCoord, setMouseCoord] = useState<{ x: number; y: number } | null>(null);
  const [traceInfo, setTraceInfo] = useState<{ x: number; y: number; color: string; expr: string } | null>(null);
  const [traceMode, setTraceMode] = useState(false);

  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);

  useEffect(() => {
    rangeRef.current = axisRange;
    rangeCache.set(card.id, axisRange);
  }, [axisRange, card.id]);

  const readCurrentRange = useCallback((): AxisRange => {
    if (fpInstanceRef.current) {
      try {
        const inst = fpInstanceRef.current;
        const xScale = inst.xScale as { domain: () => number[] } | undefined;
        const yScale = inst.yScale as { domain: () => number[] } | undefined;
        const xDomain = xScale?.domain();
        const yDomain = yScale?.domain();
        if (xDomain && yDomain && xDomain.length === 2 && yDomain.length === 2) {
          return { xMin: xDomain[0], xMax: xDomain[1], yMin: yDomain[0], yMax: yDomain[1] };
        }
      } catch { /* fallback */ }
    }
    return rangeRef.current;
  }, []);

  const renderPlot = useCallback(() => {
    if (!containerRef.current || !fpModuleCache) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    // 优先使用 rangeRef 中保存的状态，而不是从旧实例读取
    const currentRange = rangeRef.current;

    // 始终清空容器并重新渲染，确保状态一致
    containerRef.current.innerHTML = '';
    setRenderError(null);

    const plotId = 'fp-' + card.id;
    if (fpModuleCache.Chart && fpModuleCache.Chart.cache) {
      delete fpModuleCache.Chart.cache[plotId];
    }

    const data: { fn: string; color: string; graphType: 'polyline'; closed: boolean; nSamples: number }[] = [];
    const errors: string[] = [];

    const visibleFns = card.graphFunctions.filter((fn) => !fn.hidden);
    if (card.graphFunctions.length === 0) {
      // 没有函数时已经清空了容器，直接返回
      return;
    }
    if (visibleFns.length === 0) {
      // 即使没有可见函数，也渲染坐标轴
      data.push({ fn: '0', color: '#ccc', graphType: 'polyline', closed: false, nSamples: 2 });
    }

    for (const fn of visibleFns) {
      if (!validateExpr(fn.expr)) {
        errors.push(`${fn.expr}: 无法求值`);
        continue;
      }
      try {
        const parsed = parseExprForGraph(fn.expr);
        data.push({
          fn: parsed,
          color: fn.color,
          graphType: 'polyline',
          closed: false,
          nSamples: 400,
        });
      } catch (e) {
        errors.push(`${fn.expr}: ${e instanceof Error ? e.message : '解析失败'}`);
      }
    }

    if (errors.length > 0) {
      setRenderError(errors.join('; '));
    }

    if (data.length === 0) return;

    const adjustedRange = adjustAspectRatio(currentRange, rect.width, rect.height);

    try {
      const instance = fpModuleCache({
        target: containerRef.current,
        id: plotId,
        width: rect.width,
        height: rect.height,
        xAxis: { domain: [adjustedRange.xMin, adjustedRange.xMax], label: 'x' },
        yAxis: { domain: [adjustedRange.yMin, adjustedRange.yMax], label: 'y' },
        grid: true,
        data,
        zoom: true,
        disableZoom: false,
        tip: { xLine: false, yLine: false },
      }) as Record<string, unknown> | undefined;
      fpInstanceRef.current = instance ?? null;

      try {
        const xScale = instance?.xScale as { domain: () => number[] } | undefined;
        const yScale = instance?.yScale as { domain: () => number[] } | undefined;
        const xDomain = xScale?.domain();
        const yDomain = yScale?.domain();
        if (xDomain && yDomain && xDomain.length === 2 && yDomain.length === 2) {
          const actualRange = { xMin: xDomain[0], xMax: xDomain[1], yMin: yDomain[0], yMax: yDomain[1] };
          // 只在范围真正变化时才更新 state，避免无限循环
          const currentCached = rangeCache.get(card.id);
          if (!currentCached || 
              Math.abs(currentCached.xMin - actualRange.xMin) > 0.001 ||
              Math.abs(currentCached.xMax - actualRange.xMax) > 0.001 ||
              Math.abs(currentCached.yMin - actualRange.yMin) > 0.001 ||
              Math.abs(currentCached.yMax - actualRange.yMax) > 0.001) {
            rangeRef.current = actualRange;
            rangeCache.set(card.id, actualRange);
            setAxisRange(actualRange);
          }
        }
      } catch { /* ignore */ }
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : String(e));
      containerRef.current.innerHTML = '';
    }
  }, [card.graphFunctions, card.id, readCurrentRange]);

  useEffect(() => {
    cancelAnimationFrame(renderRef.current);

    const tryRender = () => {
      if (!fpModuleCache) {
        renderRef.current = requestAnimationFrame(tryRender);
        return;
      }
      renderPlot();
    };

    renderRef.current = requestAnimationFrame(tryRender);
    return () => cancelAnimationFrame(renderRef.current);
  }, [renderPlot]);

  useEffect(() => {
    const onResize = () => renderPlot();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [renderPlot]);

  // 监听函数列表和视图范围变化并触发重绘
  useEffect(() => {
    renderPlot();
  }, [card.graphFunctions, card.id, axisRange, renderPlot]);

  // function-plot 库已内置滚轮缩放和拖动功能，无需自定义事件处理器

  const animateToRange = useCallback((target: AxisRange) => {
    cancelAnimationFrame(animRef.current);
    const start = readCurrentRange();
    const duration = 300;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const newRange = lerpRange(start, target, eased);
      rangeRef.current = newRange;
      rangeCache.set(card.id, newRange);
      setAxisRange(newRange);
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };

    animRef.current = requestAnimationFrame(step);
  }, [readCurrentRange, card.id]);

  const handleAdd = () => {
    if (!inputExpr.trim()) return;
    addGraphFn(card.id, inputExpr);
    setInputExpr('');
  };

  const handleClear = () => {
    clearGraphFns(card.id);
    // 立即清空容器中的 SVG
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  };

  const handleResetView = () => {
    animateToRange({ ...DEFAULT_RANGE });
    setRangeInput({ ...DEFAULT_RANGE });
  };

  const handleZoomIn = () => {
    const current = readCurrentRange();
    const centerX = (current.xMin + current.xMax) / 2;
    const centerY = (current.yMin + current.yMax) / 2;

    // 计算缩放因子，保持纵横比
    const factor = 0.75;
    const newXRange = (current.xMax - current.xMin) * factor;
    const newYRange = (current.yMax - current.yMin) * factor;

    animateToRange({
      xMin: centerX - newXRange / 2,
      xMax: centerX + newXRange / 2,
      yMin: centerY - newYRange / 2,
      yMax: centerY + newYRange / 2,
    });
  };

  const handleZoomOut = () => {
    const current = readCurrentRange();
    const centerX = (current.xMin + current.xMax) / 2;
    const centerY = (current.yMin + current.yMax) / 2;

    // 计算缩放因子，保持纵横比
    const factor = 1.35;
    const newXRange = (current.xMax - current.xMin) * factor;
    const newYRange = (current.yMax - current.yMin) * factor;

    animateToRange({
      xMin: centerX - newXRange / 2,
      xMax: centerX + newXRange / 2,
      yMin: centerY - newYRange / 2,
      yMax: centerY + newYRange / 2,
    });
  };

  const handleApplyRange = () => {
    const { xMin, xMax, yMin, yMax } = rangeInput;
    if (xMin >= xMax || yMin >= yMax) return;
    animateToRange({ xMin, xMax, yMin, yMax });
    setShowRangePanel(false);
  };

  const handleExportPng = () => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); return; }
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'warer-graph.png';
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    };
    img.src = url;
  };

  const toggleGraphFullscreen = () => {
    if (!graphContainerRef.current) return;
    if (!document.fullscreenElement) {
      graphContainerRef.current.requestFullscreen().then(() => {
        setIsGraphFullscreen(true);
      }).catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsGraphFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsGraphFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // function-plot 库已内置拖动功能，无需自定义事件处理器
  // 但我们需要保留 traceMode 的坐标追踪功能
  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const current = readCurrentRange();
      const x = current.xMin + (px / rect.width) * (current.xMax - current.xMin);
      const y = current.yMin + (1 - py / rect.height) * (current.yMax - current.yMin);
      setMouseCoord({ x, y });

      if (traceMode && card.graphFunctions.length > 0) {
        const visibleFns = card.graphFunctions.filter((fn) => !fn.hidden);
        let closest: { y: number; color: string; expr: string; dist: number } | null = null;
        for (const fn of visibleFns) {
          const parsed = parseExprForGraph(fn.expr);
          const yVal = evalExpr(parsed, x);
          if (yVal === null) continue;
          const dist = Math.abs(yVal - y);
          if (!closest || dist < closest.dist) {
            closest = { y: yVal, color: fn.color, expr: fn.expr, dist };
          }
        }
        if (closest && closest.dist < (current.yMax - current.yMin) * 0.1) {
          setTraceInfo({ x, y: closest.y, color: closest.color, expr: closest.expr });
        } else {
          setTraceInfo(null);
        }
      }
    };

    const handleMouseLeave = () => {
      setMouseCoord(null);
      setTraceInfo(null);
    };

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [readCurrentRange, card.id, traceMode]);

  return (
    <div className="graph-tab">
      <div className="graph-toolbar">
        <input
          type="text"
          value={inputExpr}
          onChange={(e) => setInputExpr(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="输入函数，如 x^2, sin(x), ln(x)..."
          className="graph-input"
          spellCheck={false}
        />
        <button className="graph-add-btn" onClick={handleAdd}>添加</button>
        {card.graphFunctions.length > 0 && (
          <>
            <button className={`graph-tool-btn${traceMode ? ' active' : ''}`} onClick={() => { setTraceMode(!traceMode); setTraceInfo(null); }} title="追踪模式">⊕</button>
            <button className="graph-tool-btn" onClick={handleZoomIn} title="放大">＋</button>
            <button className="graph-tool-btn" onClick={handleZoomOut} title="缩小">－</button>
            <button className="graph-tool-btn" onClick={handleResetView} title="重置视图">⟲</button>
            <button className="graph-tool-btn" onClick={() => { setRangeInput(readCurrentRange()); setShowRangePanel(!showRangePanel); }} title="坐标轴范围">⚙</button>
            <button className="graph-tool-btn" onClick={handleExportPng} title="导出图片">⤓</button>
            <button className="graph-tool-btn" onClick={toggleGraphFullscreen} title="全屏模式">
              {isGraphFullscreen ? '⤓' : '⤢'}
            </button>
            <button className="graph-clear-btn" onClick={handleClear}>清空</button>
          </>
        )}
      </div>

      {showRangePanel && (
        <div className="graph-range-panel">
          <div className="graph-range-row">
            <label>x: </label>
            <input type="number" value={rangeInput.xMin} onChange={(e) => setRangeInput((r) => ({ ...r, xMin: Number(e.target.value) }))} step="1" />
            <span>~</span>
            <input type="number" value={rangeInput.xMax} onChange={(e) => setRangeInput((r) => ({ ...r, xMax: Number(e.target.value) }))} step="1" />
          </div>
          <div className="graph-range-row">
            <label>y: </label>
            <input type="number" value={rangeInput.yMin} onChange={(e) => setRangeInput((r) => ({ ...r, yMin: Number(e.target.value) }))} step="1" />
            <span>~</span>
            <input type="number" value={rangeInput.yMax} onChange={(e) => setRangeInput((r) => ({ ...r, yMax: Number(e.target.value) }))} step="1" />
          </div>
          <button className="graph-range-apply" onClick={handleApplyRange}>应用</button>
        </div>
      )}

      {card.graphFunctions.length > 0 && (
        <div className="graph-functions">
          {card.graphFunctions.map((fn) => (
            <FnTag key={fn.id} fn={fn} cardId={card.id} />
          ))}
        </div>
      )}

      <div
        ref={graphContainerRef}
        className={`graph-canvas${isGraphFullscreen ? ' fullscreen' : ''}`}
      >
        {card.graphFunctions.length === 0 ? (
          <div key="empty" className="graph-empty">
            <div className="graph-empty-icon">📈</div>
            <div className="graph-empty-text">在上方输入函数表达式添加图像</div>
            <div className="graph-examples">
              {EXAMPLE_EXPRS.map((ex) => (
                <button
                  key={ex}
                  className="graph-example-btn"
                  onClick={() => addGraphFn(card.id, ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div key="plot" ref={containerRef} style={{ width: '100%', height: '100%' }} />
        )}
        {renderError && (
          <div className="graph-error-overlay">
            <div className="result-error">{renderError}</div>
          </div>
        )}
        {mouseCoord && card.graphFunctions.length > 0 && (
          <div className="graph-coord-display">
            x: {mouseCoord.x.toFixed(2)}, y: {mouseCoord.y.toFixed(2)}
          </div>
        )}
        {traceInfo && (
          <div className="graph-trace-display" style={{ borderColor: traceInfo.color }}>
            <span style={{ color: traceInfo.color }}>●</span>
            <span className="graph-trace-expr">{traceInfo.expr}</span>
            <span className="graph-trace-val">({traceInfo.x.toFixed(3)}, {traceInfo.y.toFixed(3)})</span>
          </div>
        )}
      </div>
    </div>
  );
}
