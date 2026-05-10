import { useMemo, useRef, useCallback, useLayoutEffect, useState } from 'react';
import { useCalculator, type Card } from '../store/calculatorStore';
import { detectGraphFnType } from '../engine/graphDetection';
import KatexRenderer from './KatexRenderer';
import { inputToLatex } from '../engine/latexPreview';

function checkBracketMismatch(input: string): { fixed: string; hint: string } | null {
  if (!input) return null;
  let openCount = 0;
  for (const ch of input) {
    if (ch === '(') openCount++;
    if (ch === ')') openCount--;
    if (openCount < 0) {
      return { fixed: '(' + input, hint: '缺少左括号，已自动在开头补全' };
    }
  }
  if (openCount > 0) {
    return { fixed: input + ')'.repeat(openCount), hint: `缺少 ${openCount} 个右括号，已自动补全` };
  }
  return null;
}

function preprocessExprForPlot(input: string): string {
  let expr = input.replace(/^\s*(?:[yY]\s*=\s*|[rR]\s*=\s*)\s*/i, '').trim();
  expr = expr.replace(/\bln\b/gi, 'log');
  expr = expr.replace(/\bpi\b/gi, 'pi');
  expr = expr.replace(/\^/g, '^');
  return expr;
}

interface Props {
  card: Card;
}

export default function CalculatorTab({ card }: Props) {
  const { setInput, compute, addGraphFn, cursorPosition, setCursorPosition, navigateHistory } = useCalculator();
  const inputRef = useRef<HTMLInputElement>(null);
  const prevCursorRef = useRef<number | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const TEMPLATES = [
    { label: '求根', expr: 'solve(x^2 - 4, x)', desc: '解一元二次方程' },
    { label: '求导', expr: 'diff(x^3 + 2*x, x)', desc: '计算多项式导数' },
    { label: '积分', expr: 'integrate(x^2, x)', desc: '计算不定积分' },
    { label: '化简', expr: 'simplify(cos(x)^2 + sin(x)^2)', desc: '三角恒等式化简' },
    { label: '解方程', expr: 'solve(x^2 - 3*x + 2, x)', desc: '因式分解求根' },
    { label: '对数求导', expr: 'diff(ln(x), x)', desc: '自然对数求导' },
  ];

  const syncCursor = useCallback(() => {
    const el = inputRef.current;
    if (el) setCursorPosition(el.selectionStart ?? null);
  }, [setCursorPosition]);

  useLayoutEffect(() => {
    if (cursorPosition !== null && cursorPosition !== prevCursorRef.current && inputRef.current) {
      const pos = Math.min(cursorPosition, inputRef.current.value.length);
      inputRef.current.setSelectionRange(pos, pos);
    }
    prevCursorRef.current = cursorPosition;
  }, [cursorPosition]);

  const previewLatex = useMemo(() => inputToLatex(card.input), [card.input]);

  const bracketHint = useMemo(() => checkBracketMismatch(card.input), [card.input]);

  const canPlot = useMemo(() => {
    if (!card.input.trim()) return false;
    const cleaned = card.input.replace(/^y\s*=\s*/i, '').trim();
    return /[a-zA-Z]/.test(cleaned);
  }, [card.input]);

  const handlePlot = () => {
    const rawExpr = card.input;
    if (!rawExpr.trim()) return;
    const detection = detectGraphFnType(rawExpr);
    const cleanExpr = preprocessExprForPlot(detection.expr);
    if (!cleanExpr) return;

    const { cards, columns, activeCardId, setActiveCard } = useCalculator.getState();
    const targetFnType = detection.type;

    const getVisibleCard = (col: { cardIds: string[] }) => {
      const colCards = col.cardIds.map(id => cards.find(c => c.id === id)).filter(Boolean) as Card[];
      return colCards.find(c => c.id === activeCardId) ?? colCards[0];
    };

    for (const col of columns) {
      const visible = getVisibleCard(col);
      if (visible?.type === 'graph') {
        addGraphFn(visible.id, cleanExpr, targetFnType, detection.xExpr, detection.yExpr);
        setActiveCard(visible.id);
        return;
      }
    }

    const currentCol = columns.find((col) => col.cardIds.includes(card.id));
    if (currentCol) {
      const graphInCol = cards.find(
        (c) => c.type === 'graph' && currentCol.cardIds.includes(c.id)
      );
      if (graphInCol) {
        addGraphFn(graphInCol.id, cleanExpr, targetFnType, detection.xExpr, detection.yExpr);
        setActiveCard(graphInCol.id);
        return;
      }
    }

    const anyGraph = cards.find((c) => c.type === 'graph');
    if (anyGraph) {
      addGraphFn(anyGraph.id, cleanExpr, targetFnType, detection.xExpr, detection.yExpr);
      setActiveCard(anyGraph.id);
      return;
    }

    const targetCol = currentCol ?? columns[0];
    if (targetCol) {
      const newId = useCalculator.getState().addCard('graph', targetCol.id);
      addGraphFn(newId, cleanExpr, targetFnType, detection.xExpr, detection.yExpr);
      setActiveCard(newId);
    }
  };

  const errorPosition = card.output?.error && card.output.errorPosition != null ? card.output.errorPosition : null;

  const handleErrorClick = () => {
    if (errorPosition !== null && inputRef.current) {
      const pos = Math.min(errorPosition, card.input.length);
      inputRef.current.focus();
      inputRef.current.setSelectionRange(pos, pos + 1);
      setCursorPosition(pos);
    }
  };

  const handleAutoFix = () => {
    if (bracketHint) {
      setInput(card.id, bracketHint.fixed);
    }
  };

  return (
    <div className="calc-tab">
      <div className="display">
        <div className="display-input">
          <input
            ref={inputRef}
            type="text"
            value={card.input}
            onChange={(e) => setInput(card.id, e.target.value)}
            onSelect={syncCursor}
            onClick={syncCursor}
            onKeyUp={syncCursor}
            onKeyDown={(e) => {
              if (e.key === 'Enter') compute(card.id);
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateHistory('prev');
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateHistory('next');
              }
              setTimeout(syncCursor, 0);
            }}
            placeholder="输入表达式..."
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          {canPlot && (
            <button className="plot-inline-btn" onClick={handlePlot} title="绘制函数图像">📈</button>
          )}
        </div>
        {bracketHint && (
          <div className="bracket-hint" onClick={handleAutoFix}>
            ⚠️ {bracketHint.hint}
          </div>
        )}
      </div>

      {/* 常用模板面板 */}
      <div className="template-panel">
        <button
          className="template-toggle"
          onClick={() => setShowTemplates(!showTemplates)}
        >
          <span className="template-toggle-icon">{showTemplates ? '▼' : '▶'}</span>
          常用模板
        </button>
        {showTemplates && (
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button
                key={t.expr}
                className="template-btn"
                title={t.desc}
                onClick={() => {
                  setInput(card.id, t.expr);
                  setShowTemplates(false);
                }}
              >
                <span className="template-label">{t.label}</span>
                <span className="template-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="calc-body">
        <div className="calc-body-left">
          <div className="section-label">公式预览</div>
          <div className="preview-box">
            {previewLatex ? (
              <KatexRenderer latex={previewLatex} displayMode={true} />
            ) : (
              <div className="preview-placeholder">实时预览</div>
            )}
          </div>
        </div>
        <div className="calc-body-right">
          <div className="section-label">计算结果</div>
          <div className="result-box">
            {card.computing && <div className="computing">计算中...</div>}
            {!card.computing && card.output?.error && (
              <div className="result-error" onClick={errorPosition !== null ? handleErrorClick : undefined}>
                {card.output.error}
                {errorPosition !== null && (
                  <span className="error-position-hint"> (位置 {errorPosition}，点击定位)</span>
                )}
              </div>
            )}
            {!card.computing && card.output && !card.output.error && (
              <>
                <div className="result-badge">
                  <span className={`source-badge ${card.output.source}`}>
                    {card.output.source === 'local' ? '离线' : card.output.source === 'cloud' ? '云端' : ''}
                  </span>
                  <span className="time-badge">{card.output.executionTime}</span>
                </div>
                <KatexRenderer latex={card.output.latex} />
                {card.output.numericValue !== null && !card.output.isSymbolic && (
                  <div className="numeric-value">= {card.output.numericValue}</div>
                )}
              </>
            )}
            {!card.computing && !card.output && (
              <div className="result-placeholder">按 = 计算</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
