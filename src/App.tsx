import React, { useState, useRef, useCallback } from 'react';
import { useCalculator, type Card, type Column } from './store/calculatorStore';
import CalculatorTab from './components/CalculatorTab';
import GraphTab from './components/GraphTab';
import HistoryTab from './components/HistoryTab';
import Keyboard from './components/Keyboard';
import './App.css';

function CardTab({ card, columnId, isActive }: { card: Card; columnId: string; isActive: boolean }) {
  const { renameCard, removeCard, setActiveCard, setDragState, moveCard, columns } = useCalculator();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const col = columns.find((c) => c.id === columnId);
  const canClose = col && col.cardIds.length > 1;
  const icon = card.type === 'calculator' ? '🔢' : card.type === 'graph' ? '📈' : '📋';

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(card.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const finishEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== card.title) renameCard(card.id, trimmed);
    setEditing(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    setDragState({ cardId: card.id, fromColumnId: columnId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dragState = useCalculator.getState().dragState;
    if (!dragState || dragState.cardId === card.id) return;
    const targetIdx = col?.cardIds.indexOf(card.id) ?? 0;
    moveCard(dragState.cardId, dragState.fromColumnId, columnId, targetIdx);
    setDragState(null);
  };

  return (
    <div
      className={`card-tab${isActive ? ' active' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={() => setDragState(null)}
      onClick={() => setActiveCard(card.id)}
    >
      <span className="card-tab-icon">{icon}</span>
      {editing ? (
        <input
          ref={inputRef}
          className="card-edit-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={finishEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') setEditing(false); }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="card-tab-title" onDoubleClick={startEdit}>{card.title}</span>
      )}
      {canClose && (
        <button className="card-tab-close" onClick={(e) => { e.stopPropagation(); removeCard(card.id); }}>×</button>
      )}
    </div>
  );
}

function CardContent({ card }: { card: Card }) {
  if (card.type === 'calculator') {
    return (
      <div className="calculator-layout">
        <div className="calc-scroll">
          <CalculatorTab card={card} />
        </div>
        <Keyboard tabId={card.id} />
      </div>
    );
  }
  if (card.type === 'graph') return <GraphTab card={card} />;
  if (card.type === 'history') return <HistoryTab tab={card} />;
  return null;
}

function ColumnDivider({ leftIdx }: { leftIdx: number }) {
  const { columns, setColumnFlex } = useCalculator();
  const startX = useRef(0);
  const startWidths = useRef<number[]>([]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      const layout = document.querySelector('.columns-layout');
      if (!layout) return;
      const totalWidth = layout.getBoundingClientRect().width;
      const dividerCount = columns.length - 1;
      const availableWidth = totalWidth - dividerCount * 5;
      const totalFlex = columns.reduce((s, c) => s + c.flex, 0);
      startWidths.current = columns.map((c) => (c.flex / totalFlex) * availableWidth);

      document.documentElement.classList.add('dragging');

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX.current;
        const newWidths = [...startWidths.current];

        const leftNew = newWidths[leftIdx] + delta;
        const rightNew = newWidths[leftIdx + 1] - delta;
        const minWidth = 200;

        if (leftNew >= minWidth && rightNew >= minWidth) {
          newWidths[leftIdx] = leftNew;
          newWidths[leftIdx + 1] = rightNew;
          const totalNew = newWidths.reduce((a, b) => a + b, 0);
          columns.forEach((c, i) => {
            setColumnFlex(c.id, (newWidths[i] / totalNew) * totalFlex);
          });
        }
      };

      const onMouseUp = () => {
        document.documentElement.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [columns, leftIdx, setColumnFlex],
  );

  return <div className="column-divider" onMouseDown={onMouseDown} />;
}

function ColumnView({ column }: { column: Column }) {
  const { cards, activeCardId, addCard, removeColumn, columns } = useCalculator();
  const colCards = column.cardIds.map((id) => cards.find((c) => c.id === id)).filter(Boolean) as Card[];
  const activeCard = colCards.find((c) => c.id === activeCardId) ?? colCards[0];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dragState = useCalculator.getState().dragState;
    if (!dragState) return;
    const { moveCard, setDragState } = useCalculator.getState();
    moveCard(dragState.cardId, dragState.fromColumnId, column.id, column.cardIds.length);
    setDragState(null);
  };

  return (
    <div className="column" style={{ flex: column.flex }} onDragOver={handleDragOver} onDrop={handleDrop}>
      <div className="column-tabs">
        {colCards.map((card) => (
          <CardTab key={card.id} card={card} columnId={column.id} isActive={card.id === (activeCard?.id)} />
        ))}
        <div className="column-tab-actions">
          <button className="tab-action-btn" onClick={() => addCard('calculator', column.id)} title="添加计算器">+🔢</button>
          <button className="tab-action-btn" onClick={() => addCard('graph', column.id)} title="添加图像">+📈</button>
          <button className="tab-action-btn" onClick={() => addCard('history', column.id)} title="添加历史">+📋</button>
          {columns.length > 1 && (
            <button className="tab-action-btn tab-action-close" onClick={() => removeColumn(column.id)} title="关闭此栏">×</button>
          )}
        </div>
      </div>
      <div className="column-content">
        {activeCard && <CardContent card={activeCard} />}
      </div>
    </div>
  );
}

function App() {
  const { columns, isFullscreen, addColumn, toggleFullscreen } = useCalculator();

  return (
    <div className={`app${isFullscreen ? ' fullscreen' : ''}`}>
      <header className="app-header">
        <div className="app-header-left">
          <h1>warer</h1>
          <span className="header-badge">v0.1.0</span>
        </div>
        <div className="header-actions">
          {columns.length < 3 && (
            <button className="header-btn" onClick={addColumn} title="添加新栏">
              <span className="btn-icon">◫</span>
              <span className="btn-label">添加栏</span>
            </button>
          )}
          <button className="header-btn" onClick={toggleFullscreen} title={isFullscreen ? '退出全屏' : '全屏模式'}>
            {isFullscreen ? '⤓' : '⤢'}
          </button>
        </div>
      </header>

      <div className="columns-layout">
        {columns.map((col, i) => (
          <React.Fragment key={col.id}>
            <div className="column-wrapper" style={{ flex: col.flex, minWidth: 0 }}>
              <ColumnView column={col} />
            </div>
            {i < columns.length - 1 && <ColumnDivider leftIdx={i} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default App;
