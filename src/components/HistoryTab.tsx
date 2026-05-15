import { useState, useMemo } from 'react';
import { useCalculator, type HistoryEntry } from '../store/calculatorStore';
import KatexRenderer from './KatexRenderer';

type FilterMode = 'all' | 'calculation' | 'graph';

function getDateLabel(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays <= 7) return '本周';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

const TYPE_LABEL: Record<string, string> = {
  linear: 'y',
  polar: 'r',
  parametric: 'P',
  implicit: 'f',
};

export default function HistoryTab() {
  const { history, clearHistory, loadHistoryItem } = useCalculator();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const filteredHistory = useMemo(() => {
    let items = history;
    if (filter !== 'all') {
      items = items.filter((item) => item.type === filter);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter((item) => {
        if (item.input.toLowerCase().includes(term)) return true;
        if (item.type === 'calculation' && item.output.plainText?.toLowerCase().includes(term)) return true;
        if (item.type === 'graph' && item.expr.toLowerCase().includes(term)) return true;
        return false;
      });
    }
    return items;
  }, [history, filter, searchTerm]);

  const displayList = useMemo(() => {
    const reversed = [...filteredHistory].reverse();
    const groups: { label: string; items: HistoryEntry[] }[] = [];
    let currentLabel = '';
    let currentGroup: HistoryEntry[] = [];

    for (const item of reversed) {
      const label = getDateLabel(item.timestamp);
      if (label !== currentLabel) {
        if (currentGroup.length > 0) {
          groups.push({ label: currentLabel, items: currentGroup });
        }
        currentLabel = label;
        currentGroup = [item];
      } else {
        currentGroup.push(item);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ label: currentLabel, items: currentGroup });
    }
    return groups;
  }, [filteredHistory]);

  return (
    <div className="history-tab">
      <div className="history-toolbar">
        <span className="history-count">{filteredHistory.length} 条记录</span>
        <div className="history-filter-group">
          {(['all', 'calculation', 'graph'] as const).map((m) => (
            <button
              key={m}
              className={`history-filter-btn${filter === m ? ' active' : ''}`}
              onClick={() => setFilter(m)}
            >
              {m === 'all' ? '全部' : m === 'calculation' ? '计算' : '绘图'}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="history-search-input"
          placeholder="搜索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {history.length > 0 && (
          <button className="history-clear-btn" onClick={clearHistory}>清空</button>
        )}
      </div>
      {displayList.length === 0 ? (
        <div className="history-empty">
          <div className="graph-empty-icon">📋</div>
          <div className="graph-empty-text">
            {searchTerm ? '未找到匹配记录' : '暂无历史记录'}
          </div>
        </div>
      ) : (
        <div className="history-full-list">
          {displayList.map((group) => (
            <div key={group.label} className="history-date-group">
              <div className="history-date-header">{group.label}</div>
              {group.items.map((item, i) => (
                <div
                  key={`${item.timestamp}-${i}`}
                  className="history-full-item"
                  onClick={() => loadHistoryItem(item)}
                >
                  {item.type === 'calculation' ? (
                    <>
                      <div className="history-full-input">
                        <span className="history-item-badge calc">算</span>
                        {item.input}
                      </div>
                      {!item.output.error ? (
                        <div className="history-full-result">
                          <KatexRenderer latex={item.output.latex} displayMode={false} />
                        </div>
                      ) : (
                        <div className="history-full-error">{item.output.error}</div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="history-full-input">
                        <span className="history-item-badge graph">绘</span>
                        {item.input}
                      </div>
                      <div className="history-graph-meta">
                        <span className="history-graph-color-dot" style={{ background: item.color }} />
                        <span className="graph-fn-type-badge">{TYPE_LABEL[item.fnType] || 'y'}</span>
                        <span className="history-graph-expr">{item.expr}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
