import { useCalculator, type Card } from '../store/calculatorStore';
import KatexRenderer from './KatexRenderer';

interface Props {
  tab: Card;
}

export default function HistoryTab({ tab: _tab }: Props) {
  const { history, clearHistory, loadHistoryItem } = useCalculator();

  return (
    <div className="history-tab">
      <div className="history-toolbar">
        <span className="history-count">{history.length} 条记录</span>
        {history.length > 0 && (
          <button className="history-clear-btn" onClick={clearHistory}>清空</button>
        )}
      </div>
      {history.length === 0 ? (
        <div className="history-empty">
          <div className="graph-empty-icon">📋</div>
          <div className="graph-empty-text">暂无历史记录</div>
        </div>
      ) : (
        <div className="history-full-list">
          {[...history].reverse().map((item, i) => (
            <div key={i} className="history-full-item" onClick={() => loadHistoryItem(item.input)}>
              <div className="history-full-input">{item.input}</div>
              {!item.output.error ? (
                <div className="history-full-result">
                  <KatexRenderer latex={item.output.latex} displayMode={false} />
                </div>
              ) : (
                <div className="history-full-error">{item.output.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
