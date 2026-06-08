import { useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { useCalculator, COLORS, type Card } from '../store/calculatorStore';
import { detectGraphFnType } from '../engine/graphDetection';
import KatexRenderer from './KatexRenderer';
import { inputToLatex } from '../engine/latexPreview';
import FunctionPanel from './FunctionPanel';

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
  const { setInput, compute, addGraphFn, cursorPosition, setCursorPosition, navigateHistory, appendInput } = useCalculator();
  const inputRef = useRef<HTMLInputElement>(null);
  const prevCursorRef = useRef<number | null>(null);

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

    const state = useCalculator.getState();
    const { cards, columns, setActiveCard } = state;
    const targetFnType = detection.type;

    const currentCol = columns.find((col) => col.cardIds.includes(card.id));
    if (!currentCol) return;

    const otherCols = columns.filter((col) => col.id !== currentCol.id);
    let targetId: string | null = null;

    for (const col of otherCols) {
      const gc = cards.find((c) => c.id === col.activeCardId);
      if (gc && gc.type === 'graph') { targetId = gc.id; break; }
    }
    if (!targetId) {
      for (const col of otherCols) {
        const gc = cards.find((c) => c.type === 'graph' && col.cardIds.includes(c.id));
        if (gc) { targetId = gc.id; break; }
      }
    }
    if (!targetId) {
      const gc = cards.find((c) => c.type === 'graph' && currentCol.cardIds.includes(c.id));
      if (gc) targetId = gc.id;
    }
    if (!targetId) {
      targetId = state.addCard('graph', currentCol.id);
    }

    const fnCount = cards.find(c => c.id === targetId)?.graphFunctions.length ?? 0;
    const nextColor = COLORS[fnCount % COLORS.length];

    addGraphFn(targetId, cleanExpr, targetFnType, detection.xExpr, detection.yExpr);
    state.addGraphHistory({
      input: rawExpr,
      fnType: targetFnType,
      expr: cleanExpr,
      xExpr: detection.xExpr,
      yExpr: detection.yExpr,
      color: nextColor,
    });
    setActiveCard(targetId);
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

      <FunctionPanel
        onInsert={(value) => appendInput(card.id, value, cursorPosition)}
        onTemplate={(expr) => setInput(card.id, expr)}
      />

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
            {!card.computing && card.output?.error && (() => {
              // 解析错误类型: "MathError: ..." 或 "SyntaxError: ..." 格式
              const errStr = card.output.error;
              const colonIdx = errStr.indexOf(':');
              const errType = colonIdx > 0 ? errStr.slice(0, colonIdx) : null;
              const errMsg = colonIdx > 0 ? errStr.slice(colonIdx + 1).trim() : errStr;
              const errIcon =
                errType === 'MathError' ? '⚠️' :
                errType === 'SyntaxError' ? '✏️' :
                errType === 'TimeoutError' ? '⏱' :
                errType === 'NetworkError' ? '🔌' : '❌';
              const errTypeClass = errType ? `error-type-${errType.toLowerCase().replace(/error$/, '')}` : '';
              return (
                <div
                  className={`result-error ${errTypeClass}`}
                  onClick={errorPosition !== null ? handleErrorClick : undefined}
                >
                  <div className="result-error-header">
                    <span className="result-error-icon">{errIcon}</span>
                    {errType && <span className="result-error-type">{errType}</span>}
                    {errorPosition !== null && (
                      <span className="error-position-hint">位置 {errorPosition}</span>
                    )}
                  </div>
                  <div className="result-error-message">{errMsg}</div>
                </div>
              );
            })()}
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
