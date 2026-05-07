import { useEffect, useRef, useCallback, useState } from 'react';
import { useCalculator, type Card, type GraphFn } from '../store/calculatorStore';

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

interface Props {
  card: Card;
}

export default function GraphTab({ card }: Props) {
  const { removeGraphFn, addGraphFn, clearGraphFns } = useCalculator();
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<number>(0);
  const [inputExpr, setInputExpr] = useState('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const fpRef = useRef<((opts: Record<string, unknown>) => void) & { Chart?: { cache: Record<string, unknown> } } | null>(null);

  useEffect(() => {
    import('function-plot').then((mod) => {
      const raw = mod.default || mod;
      const fn = (raw as unknown as Record<string, unknown>).default || raw;
      if (typeof fn === 'function') {
        fpRef.current = fn as typeof fpRef.current;
      }
    }).catch(() => {});
  }, []);

  const renderPlot = useCallback(() => {
    if (!containerRef.current || !fpRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    containerRef.current.innerHTML = '';
    setRenderError(null);

    if (card.graphFunctions.length === 0) return;

    try {
      if (fpRef.current.Chart) {
        fpRef.current.Chart.cache = {};
      }

      const data = card.graphFunctions.map((fn: GraphFn) => ({
        fn: parseExprForGraph(fn.expr),
        color: fn.color,
        graphType: 'polyline' as const,
        closed: false,
        nSamples: 400,
      }));

      const plotId = 'fp-' + card.id;

      fpRef.current({
        target: containerRef.current,
        id: plotId,
        width: rect.width,
        height: rect.height,
        xAxis: { domain: [-10, 10] },
        yAxis: { domain: [-10, 10] },
        grid: true,
        data,
      });
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : String(e));
      containerRef.current.innerHTML = '';
    }
  }, [card.graphFunctions, card.id]);

  useEffect(() => {
    cancelAnimationFrame(renderRef.current);
    renderRef.current = requestAnimationFrame(renderPlot);
    return () => cancelAnimationFrame(renderRef.current);
  }, [renderPlot]);

  useEffect(() => {
    const onResize = () => renderPlot();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [renderPlot]);

  const handleAdd = () => {
    if (!inputExpr.trim()) return;
    addGraphFn(card.id, inputExpr);
    setInputExpr('');
  };

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
          <button className="graph-clear-btn" onClick={() => clearGraphFns(card.id)}>清空</button>
        )}
      </div>

      {card.graphFunctions.length > 0 && (
        <div className="graph-functions">
          {card.graphFunctions.map((fn) => (
            <span key={fn.id} className="graph-fn-tag">
              <span style={{ color: fn.color }}>●</span>
              {fn.expr}
              <button className="graph-fn-remove" onClick={() => removeGraphFn(card.id, fn.id)}>×</button>
            </span>
          ))}
        </div>
      )}

      <div className="graph-canvas">
        {card.graphFunctions.length === 0 ? (
          <div className="graph-empty">
            <div className="graph-empty-icon">📈</div>
            <div className="graph-empty-text">在上方输入函数表达式添加图像</div>
            <div className="graph-hint">支持: x^2, sin(x), cos(x), log(x), sqrt(x), e^x 等</div>
          </div>
        ) : (
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        )}
        {renderError && (
          <div className="graph-error-overlay">
            <div className="result-error">{renderError}</div>
          </div>
        )}
      </div>
    </div>
  );
}
