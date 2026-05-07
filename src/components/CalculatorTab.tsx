import { useMemo } from 'react';
import { useCalculator, type Card } from '../store/calculatorStore';
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

interface Props {
  card: Card;
}

export default function CalculatorTab({ card }: Props) {
  const { setInput, compute, addGraphFn } = useCalculator();

  const previewLatex = useMemo(() => inputToLatex(card.input), [card.input]);

  const bracketHint = useMemo(() => checkBracketMismatch(card.input), [card.input]);

  const canPlot =
    card.output &&
    !card.output.error &&
    card.output.isSymbolic &&
    card.output.variables.length > 0;

  const handlePlot = () => {
    const cleanExpr = card.input.replace(/^y\s*=\s*/i, '').trim();
    const { cards, columns, setActiveCard } = useCalculator.getState();
    let graphCard = cards.find((c) => c.type === 'graph');

    if (!graphCard) {
      const newId = useCalculator.getState().addCard('graph');
      graphCard = useCalculator.getState().cards.find((c) => c.id === newId);
    }

    if (graphCard) {
      addGraphFn(graphCard.id, cleanExpr);
      const graphCol = columns.find((c) => c.cardIds.includes(graphCard!.id));
      if (graphCol) {
        setActiveCard(graphCard.id);
      }
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
            type="text"
            value={card.input}
            onChange={(e) => setInput(card.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') compute(card.id);
            }}
            placeholder="输入表达式..."
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        {bracketHint && (
          <div className="bracket-hint" onClick={handleAutoFix}>
            ⚠️ {bracketHint.hint} <span className="bracket-hint-action">点击修复</span>
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
              <div className="result-error">{card.output.error}</div>
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
          {canPlot && (
            <button className="plot-btn" onClick={handlePlot}>
              📈 绘制函数图像
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
