import { useEffect, useRef, useCallback, useState } from 'react';
import { useCalculator, type Card, type GraphFn, type GraphMode, COLORS } from '../store/calculatorStore';

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
  let s = expr.replace(/^\s*(?:[yY]\s*=\s*|[rR]\s*=\s*)\s*/, '').trim();
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

  const parsed = result.join('');

  const openCount = (parsed.match(/\(/g) || []).length;
  const closeCount = (parsed.match(/\)/g) || []).length;
  if (openCount !== closeCount) {
    throw new Error('括号不匹配');
  }
  
  return parsed;
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
  const xRange = range.xMax - range.xMin;
  const yRange = range.yMax - range.yMin;

  const containerRatio = width / height;
  const dataRatio = xRange / yRange;

  if (dataRatio > containerRatio) {
    const newYRange = xRange / containerRatio;
    const yCenter = (range.yMin + range.yMax) / 2;
    return {
      ...range,
      yMin: yCenter - newYRange / 2,
      yMax: yCenter + newYRange / 2
    };
  } else {
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

function findTopLevelComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) return i;
  }
  return -1;
}

function FnTag({ fn, cardId }: { fn: GraphFn; cardId: string }) {
  const { removeGraphFn, updateGraphFn, toggleGraphFnVisibility } = useCalculator();
  const [editing, setEditing] = useState(false);
  const [editExpr, setEditExpr] = useState(fn.expr);
  const [showColors, setShowColors] = useState(false);

  const startEdit = () => {
    if (fn.fnType === 'parametric') {
      // Show the edit input as t(xExpr, yExpr) so both fields can be edited together
      setEditExpr(`t(${fn.xExpr}, ${fn.yExpr})`);
    } else {
      setEditExpr(fn.expr);
    }
    setEditing(true);
  };

  const finishEdit = () => {
    const trimmed = editExpr.trim();
    if (!trimmed) { setEditing(false); return; }

    if (fn.fnType === 'parametric') {
      const lower = trimmed.toLowerCase();
      if (lower.startsWith('t(') && trimmed.endsWith(')')) {
        const inner = trimmed.slice(2, -1).trim();
        const commaIdx = findTopLevelComma(inner);
        if (commaIdx !== -1) {
          const newX = inner.slice(0, commaIdx).trim();
          const newY = inner.slice(commaIdx + 1).trim();
          if (newX && newY && (newX !== fn.xExpr || newY !== fn.yExpr)) {
            updateGraphFn(cardId, fn.id, { expr: trimmed, xExpr: newX, yExpr: newY });
          }
          setEditing(false);
          return;
        }
      }
      // If parsing fails, don't update — user can re-enter
      setEditing(false);
      return;
    }

    const cleaned = trimmed.replace(/^y\s*=\s*/i, '');
    if (cleaned && cleaned !== fn.expr) {
      updateGraphFn(cardId, fn.id, { expr: cleaned });
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
        <span className="graph-fn-expr" onDoubleClick={startEdit} title="双击编辑" style={{ opacity: fn.hidden ? 0.5 : 1 }}>
          <span className="graph-fn-type-badge">{fn.fnType === 'polar' ? 'r' : fn.fnType === 'parametric' ? 'P' : fn.fnType === 'implicit' ? 'f' : 'y'}</span>
          {fn.fnType === 'parametric' ? `x=${fn.xExpr}, y=${fn.yExpr}` : fn.expr}
        </span>
      )}
      <button className="graph-fn-toggle" onClick={() => toggleGraphFnVisibility(cardId, fn.id)} title={fn.hidden ? '显示' : '隐藏'}>{fn.hidden ? '👁' : '👁‍🗨'}</button>
      <button className="graph-fn-remove" onClick={() => removeGraphFn(cardId, fn.id)}>×</button>
    </span>
  );
}

const EXAMPLES: Record<GraphMode, { label: string; x: string; y?: string }[]> = {
  linear: [
    { label: 'x^2', x: 'x^2' },
    { label: 'sin(x)', x: 'sin(x)' },
    { label: 'cos(x)', x: 'cos(x)' },
    { label: 'log(x)', x: 'log(x)' },
    { label: 'sqrt(x)', x: 'sqrt(x)' },
    { label: 'e^x', x: 'e^x' },
    { label: '1/x', x: '1/x' },
  ],
  polar: [
    { label: 'sin(2θ)', x: 'sin(2*theta)' },
    { label: 'cos(3θ)', x: 'cos(3*theta)' },
    { label: 'θ', x: 'theta' },
    { label: '心形线', x: '1+cos(theta)' },
    { label: '三叶草', x: 'sin(3*theta)' },
    { label: '四叶草', x: 'cos(2*theta)' },
  ],
  parametric: [
    { label: '圆', x: 'cos(t)', y: 'sin(t)' },
    { label: '椭圆', x: '3*cos(t)', y: '2*sin(t)' },
    { label: '利萨如', x: 'sin(3*t)', y: 'cos(5*t)' },
    { label: '心脏线', x: '16*sin(t)^3', y: '13*cos(t)-5*cos(2*t)-2*cos(3*t)-cos(4*t)' },
    { label: '螺旋', x: 't*cos(t)', y: 't*sin(t)' },
  ],
  implicit: [
    { label: '圆', x: 'x^2 + y^2 - 4' },
    { label: '椭圆', x: 'x^2/4 + y^2/9 - 1' },
    { label: '双曲线', x: 'x^2 - y^2 - 1' },
    { label: '抛物线', x: 'y - x^2' },
    { label: '蔓叶线', x: 'x^3 + y^3 - 3*x*y' },
  ],
};

export default function GraphTab({ card }: Props) {
  const { addGraphFn, clearGraphFns } = useCalculator();

  const MODE_OPTIONS: { key: GraphMode; label: string }[] = [
    { key: 'linear', label: 'y=f(x)' },
    { key: 'polar', label: 'r=f(θ)' },
    { key: 'parametric', label: 'x(t),y(t)' },
    { key: 'implicit', label: 'f(x,y)=0' },
  ];

  const [inputMode, setInputMode] = useState<GraphMode>('linear');
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<number>(0);
  const [inputExpr, setInputExpr] = useState('');
  const [paramYExpr, setParamYExpr] = useState('');
  const [renderError, setRenderError] = useState<string | null>(null);

  const [axisRange, setAxisRange] = useState<AxisRange>(() => rangeCache.get(card.id) ?? { ...DEFAULT_RANGE });
  const rangeRef = useRef<AxisRange>(axisRange);
  const fpInstanceRef = useRef<Record<string, unknown> | null>(null);
  const animRef = useRef<number>(0);
  const [showRangePanel, setShowRangePanel] = useState(false);
  const [rangeInput, setRangeInput] = useState<AxisRange>({ ...DEFAULT_RANGE });

  const [mouseCoord, setMouseCoord] = useState<{ x: number; y: number } | null>(null);
  const [traceInfo, setTraceInfo] = useState<{ x: number; y: number; color: string; expr: string } | null>(null);

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

    const currentRange = rangeRef.current;

    containerRef.current.innerHTML = '';
    setRenderError(null);

    const plotId = 'fp-' + card.id;
    if (fpModuleCache.Chart && fpModuleCache.Chart.cache) {
      delete fpModuleCache.Chart.cache[plotId];
    }

    type PlotDatum = Record<string, unknown>;

    const data: PlotDatum[] = [];
    const errors: string[] = [];
    const fnLookup: { expr: string; color: string }[] = [];

    const visibleFns = card.graphFunctions.filter((fn) => !fn.hidden);
    if (card.graphFunctions.length === 0) {
      return;
    }
    if (visibleFns.length === 0) {
      data.push({ fn: '0', color: '#ccc', graphType: 'polyline', closed: false, nSamples: 2 });
    }

    for (const fn of visibleFns) {
      try {
        let datum: PlotDatum | null = null;
        
        if (fn.fnType === 'linear') {
          const parsed = parseExprForGraph(fn.expr);
          datum = { fn: parsed, color: fn.color, graphType: 'polyline', closed: false, nSamples: 400, title: fn.expr };
          fnLookup.push({ expr: fn.expr, color: fn.color });
        } else if (fn.fnType === 'polar') {
          const parsed = parseExprForGraph(fn.expr);
          datum = { r: parsed, fnType: 'polar', color: fn.color, graphType: 'polyline', closed: false, nSamples: 600, range: [0, 4 * Math.PI], title: 'r=' + fn.expr };
          fnLookup.push({ expr: 'r=' + fn.expr, color: fn.color });
        } else if (fn.fnType === 'parametric') {
          const xParsed = parseExprForGraph(fn.xExpr);
          const yParsed = parseExprForGraph(fn.yExpr);
          datum = { x: xParsed, y: yParsed, fnType: 'parametric', color: fn.color, graphType: 'polyline', closed: false, nSamples: 600, range: [0, 2 * Math.PI], title: 'x=' + fn.xExpr + ', y=' + fn.yExpr };
          fnLookup.push({ expr: 'x=' + fn.xExpr + ', y=' + fn.yExpr, color: fn.color });
        } else if (fn.fnType === 'implicit') {
          const parsed = parseExprForGraph(fn.expr);
          datum = { fn: parsed, fnType: 'implicit', color: fn.color, graphType: 'interval', nSamples: 400, sampler: 'interval', title: fn.expr };
          fnLookup.push({ expr: fn.expr, color: fn.color });
        }
        
        if (datum) {
          data.push(datum);
        }
      } catch (e) {
        errors.push(`${fn.expr}: ${e instanceof Error ? e.message : '解析失败'}`);
        console.warn(`函数解析失败: ${fn.expr}`, e);
      }
    }

    if (errors.length > 0) {
      setRenderError(errors.join('; '));
    }

    const hasData = data.length > 0;
    if (!hasData) {
      data.push({ fn: '0', color: '#ccc', graphType: 'polyline', closed: false, nSamples: 2 });
    }

    const adjustedRange = adjustAspectRatio(currentRange, rect.width, rect.height);

    try {
      const prev = fpInstanceRef.current as Record<string, unknown> | null;
      if (prev && typeof (prev as Record<string, unknown>).removeAllListeners === 'function') {
        ((prev as Record<string, unknown>).removeAllListeners as () => void)();
      }

      const validData = data.filter((d) => {
        if (d.fnType === 'parametric') {
          return d.x != null && d.y != null;
        }
        if (d.fnType === 'polar') {
          return d.r != null;
        }
        if (d.fnType === 'implicit') {
          return d.fn != null;
        }
        return d.fn != null;
      });

      const finalData = validData.length > 0 ? validData : [{ fn: '0', color: '#ccc', graphType: 'polyline', closed: false, nSamples: 2 }];

      const instance = fpModuleCache({
        target: containerRef.current,
        id: plotId,
        width: rect.width,
        height: rect.height,
        xAxis: { domain: [adjustedRange.xMin, adjustedRange.xMax], label: 'x' },
        yAxis: { domain: [adjustedRange.yMin, adjustedRange.yMax], label: 'y' },
        grid: true,
        data: finalData,
        zoom: true,
        disableZoom: false,
        tip: { xLine: false, yLine: false },
      }) as Record<string, unknown> | undefined;
      fpInstanceRef.current = instance ?? null;

      if (instance && typeof (instance as Record<string, unknown>).on === 'function') {
        const chart = instance as Record<string, unknown>;
        const chartOn = chart.on as (event: string, handler: (...args: never[]) => void) => void;
        chartOn('before:mousemove', (coord: { x: number; y: number }) => {
          setMouseCoord({ x: coord.x, y: coord.y });
        });
        chartOn('tip:update', (info: { x: number; y: number; index: number }) => {
          const entry = fnLookup[info.index];
          if (entry) {
            setTraceInfo({ x: info.x, y: info.y, color: entry.color, expr: entry.expr });
          }
        });
        chartOn('mouseout', () => {
          setTraceInfo(null);
        });
      }

      try {
        const xScale = instance?.xScale as { domain: () => number[] } | undefined;
        const yScale = instance?.yScale as { domain: () => number[] } | undefined;
        const xDomain = xScale?.domain();
        const yDomain = yScale?.domain();
        if (xDomain && yDomain && xDomain.length === 2 && yDomain.length === 2) {
          const actualRange = { xMin: xDomain[0], xMax: xDomain[1], yMin: yDomain[0], yMax: yDomain[1] };
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
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error('绘图渲染失败:', errorMsg);
      setRenderError(`绘图引擎错误: ${errorMsg}`);
    }

  }, [card.graphFunctions, card.id, axisRange]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (inputMode === 'parametric') {
      if (!paramYExpr.trim()) return;
      addGraphFn(card.id, inputExpr, 'parametric', inputExpr, paramYExpr);
      setInputExpr('');
      setParamYExpr('');
    } else {
      addGraphFn(card.id, inputExpr, inputMode);
      setInputExpr('');
    }
  };

  const handleClear = () => {
    clearGraphFns(card.id);
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

  return (
    <div className="graph-tab">
      <div className="graph-toolbar">
        <div className="graph-mode-selector">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`graph-mode-btn${inputMode === opt.key ? ' active' : ''}`}
              onClick={() => setInputMode(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {inputMode === 'parametric' ? (
          <div className="graph-param-inputs">
            <span className="graph-param-label">x(t)=</span>
            <input
              type="text"
              value={inputExpr}
              onChange={(e) => setInputExpr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="16*sin(t)^3"
              className="graph-input"
              spellCheck={false}
            />
            <span className="graph-param-label">y(t)=</span>
            <input
              type="text"
              value={paramYExpr}
              onChange={(e) => setParamYExpr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="13*cos(t)-5*cos(2*t)-..."
              className="graph-input"
              spellCheck={false}
            />
          </div>
        ) : (
          <input
            type="text"
            value={inputExpr}
            onChange={(e) => setInputExpr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder={inputMode === 'polar' ? '输入 r = f(θ)，如 sin(2*theta)' : inputMode === 'implicit' ? '输入 f(x, y) = 0，如 x^2 + y^2 - 4' : '输入函数，如 x^2, sin(x)...'}
            className="graph-input"
            spellCheck={false}
          />
        )}
        <button className="graph-add-btn" onClick={handleAdd}>添加</button>
        {card.graphFunctions.length > 0 && (
          <>
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
            <div className="graph-empty-text">在上方输入表达式添加图像</div>
            <div className="graph-examples">
              {EXAMPLES[inputMode].map((ex) => (
                <button
                  key={ex.label}
                  className="graph-example-btn"
                  onClick={() => {
                    if (inputMode === 'parametric' && ex.y) {
                      addGraphFn(card.id, ex.x, 'parametric', ex.x, ex.y);
                    } else {
                      addGraphFn(card.id, ex.x, inputMode);
                    }
                  }}
                >
                  {ex.label}
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
