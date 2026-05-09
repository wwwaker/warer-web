import { useState, useMemo } from 'react';
import { useCalculator, type Card } from '../store/calculatorStore';
import KatexRenderer from './KatexRenderer';

interface Props {
  tab: Card;
}

export default function HistoryTab({ tab: _tab }: Props) {
  const { history, clearHistory, loadHistoryItem } = useCalculator();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHistory = useMemo(() => {
    if (!searchTerm) return history;
    return history.filter(item => 
      item.input.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.output.plainText && item.output.plainText.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [history, searchTerm]);

  return (
    <div className="history-tab">
      <div className="history-toolbar">
        <span className="history-count">{filteredHistory.length} 条记录</span>
        <input 
          type="text" 
          className="history-search-input"
          placeholder="搜索历史..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {history.length > 0 && (
          <button className="history-clear-btn" onClick={clearHistory}>清空</button>
        )}
      </div>
      {filteredHistory.length === 0 ? (
        <div className="history-empty">
          <div className="graph-empty-icon">📋</div>
          <div className="graph-empty-text">{searchTerm ? '未找到匹配记录' : '暂无历史记录'}</div>
        </div>
      ) : (
        <div className="history-full-list">
          {[...filteredHistory].reverse().map((item, i) => (
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
