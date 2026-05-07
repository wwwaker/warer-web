import { create } from 'zustand';
import { dispatch, type ComputeOutput } from '../engine/dispatcher';

export type CardType = 'calculator' | 'graph' | 'history';

export interface GraphFn {
  id: string;
  expr: string;
  color: string;
  hidden: boolean;
}

export interface Card {
  id: string;
  type: CardType;
  title: string;
  input: string;
  output: ComputeOutput | null;
  computing: boolean;
  graphFunctions: GraphFn[];
}

export interface Column {
  id: string;
  cardIds: string[];
  flex: number;
}

export const COLORS = ['#5b5ef0', '#0ea5a0', '#e5484d', '#f5a623', '#30a46c', '#e84393', '#8b5cf6', '#f472b6'];

let cardCounter = 0;
function nextId() {
  return `card_${++cardCounter}_${Date.now().toString(36)}`;
}

function createCalcCard(title?: string): Card {
  return {
    id: nextId(),
    type: 'calculator',
    title: title ?? `计算器`,
    input: '',
    output: null,
    computing: false,
    graphFunctions: [],
  };
}

function createGraphCard(title?: string): Card {
  return {
    id: nextId(),
    type: 'graph',
    title: title ?? '函数图像',
    input: '',
    output: null,
    computing: false,
    graphFunctions: [],
  };
}

function createHistoryCard(title?: string): Card {
  return {
    id: nextId(),
    type: 'history',
    title: title ?? '历史记录',
    input: '',
    output: null,
    computing: false,
    graphFunctions: [],
  };
}

interface CalculatorState {
  cards: Card[];
  columns: Column[];
  activeCardId: string | null;
  history: { input: string; output: ComputeOutput }[];
  historyIndex: number | null;
  isFullscreen: boolean;
  dragState: { cardId: string; fromColumnId: string } | null;
  cursorPosition: number | null;

  addCard: (type: CardType, targetColumnId?: string) => string;
  removeCard: (id: string) => void;
  renameCard: (id: string, title: string) => void;
  setActiveCard: (id: string | null) => void;
  moveCard: (cardId: string, fromColumnId: string, toColumnId: string, toIndex: number) => void;
  addColumn: () => void;
  removeColumn: (columnId: string) => void;
  setColumnFlex: (columnId: string, flex: number) => void;
  setInput: (id: string, v: string) => void;
  appendInput: (id: string, v: string, cursorPos?: number | null) => void;
  backspace: (id: string, cursorPos?: number | null) => void;
  clearInput: (id: string) => void;
  compute: (id: string) => Promise<void>;
  addGraphFn: (cardId: string, expr: string) => void;
  removeGraphFn: (cardId: string, fnId: string) => void;
  clearGraphFns: (cardId: string) => void;
  updateGraphFn: (cardId: string, fnId: string, updates: Partial<Pick<GraphFn, 'expr' | 'color' | 'hidden'>>) => void;
  toggleGraphFnVisibility: (cardId: string, fnId: string) => void;
  toggleFullscreen: () => void;
  clearHistory: () => void;
  loadHistoryItem: (input: string) => void;
  navigateHistory: (direction: 'prev' | 'next') => void;
  setDragState: (s: { cardId: string; fromColumnId: string } | null) => void;
  setCursorPosition: (pos: number | null) => void;
  getFirstCalcCard: () => Card | undefined;
  getFirstGraphCard: () => Card | undefined;
}

const calc1 = createCalcCard('计算器');
const graph1 = createGraphCard('函数图像');
cardCounter = 2;

const col1Id = `col_1`;
const col2Id = `col_2`;

const abortControllers = new Map<string, AbortController>();

export const useCalculator = create<CalculatorState>((set, get) => ({
  cards: [calc1, graph1],
  columns: [
    { id: col1Id, cardIds: [calc1.id], flex: 1 },
    { id: col2Id, cardIds: [graph1.id], flex: 1 },
  ],
  activeCardId: calc1.id,
  history: [],
  historyIndex: null,
  isFullscreen: false,
  dragState: null,
  cursorPosition: null,

  addCard: (type, targetColumnId) => {
    const card = type === 'calculator' ? createCalcCard()
      : type === 'graph' ? createGraphCard()
      : createHistoryCard();

    const cols = get().columns;
    const targetCol = targetColumnId
      ? cols.find((c) => c.id === targetColumnId)
      : cols.reduce((a, b) => a.cardIds.length <= b.cardIds.length ? a : b);

    if (!targetCol) {
      set((s) => ({ cards: [...s.cards, card], activeCardId: card.id }));
      return card.id;
    }

    set((s) => ({
      cards: [...s.cards, card],
      columns: s.columns.map((c) =>
        c.id === targetCol.id ? { ...c, cardIds: [...c.cardIds, card.id] } : c
      ),
    }));
    return card.id;
  },

  removeCard: (id) => {
    const { cards, columns, activeCardId } = get();
    const card = cards.find((c) => c.id === id);
    if (!card) return;

    const col = columns.find((c) => c.cardIds.includes(id));
    if (col && col.cardIds.length <= 1) return;

    const next = cards.filter((c) => c.id !== id);
    let newActive = activeCardId;
    if (activeCardId === id) {
      newActive = next.length > 0 ? next[0].id : null;
    }

    set({
      cards: next,
      activeCardId: newActive,
      columns: columns.map((c) => ({
        ...c,
        cardIds: c.cardIds.filter((cid) => cid !== id),
      })),
    });
  },

  renameCard: (id, title) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, title } : c)),
    })),

  setActiveCard: (id) => set({ activeCardId: id }),

  moveCard: (cardId, fromColumnId, toColumnId, toIndex) => {
    set((s) => ({
      columns: s.columns.map((c) => {
        if (c.id === fromColumnId && c.id === toColumnId) {
          const ids = c.cardIds.filter((id) => id !== cardId);
          ids.splice(toIndex, 0, cardId);
          return { ...c, cardIds: ids };
        }
        if (c.id === fromColumnId) {
          return { ...c, cardIds: c.cardIds.filter((id) => id !== cardId) };
        }
        if (c.id === toColumnId) {
          const ids = [...c.cardIds];
          ids.splice(toIndex, 0, cardId);
          return { ...c, cardIds: ids };
        }
        return c;
      }),
    }));
  },

  addColumn: () => {
    const { columns } = get();
    if (columns.length >= 3) return;
    const newCard = createCalcCard('计算器');
    const newColId = `col_${Date.now().toString(36)}`;
    set((s) => ({
      cards: [...s.cards, newCard],
      columns: [...s.columns, { id: newColId, cardIds: [newCard.id], flex: 1 }],
    }));
  },

  removeColumn: (columnId) => {
    const { columns } = get();
    if (columns.length <= 1) return;
    const col = columns.find((c) => c.id === columnId);
    if (!col) return;

    const otherCols = columns.filter((c) => c.id !== columnId);
    const firstOther = otherCols[0];
    const evenFlex = 1;

    set({
      columns: otherCols.map((c) =>
        c.id === firstOther.id
          ? { ...c, cardIds: [...c.cardIds, ...col.cardIds], flex: evenFlex }
          : { ...c, flex: evenFlex }
      ),
    });
  },

  setColumnFlex: (columnId, flex) =>
    set((s) => ({
      columns: s.columns.map((c) =>
        c.id === columnId ? { ...c, flex: Math.max(0.3, flex) } : c
      ),
    })),

  setInput: (id, v) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, input: v } : c)),
    })),

  appendInput: (id, v, cursorPos) =>
    set((s) => ({
      cursorPosition: (() => {
        const card = s.cards.find((c) => c.id === id);
        if (!card) return null;
        const pos = cursorPos ?? s.cursorPosition ?? card.input.length;
        return pos + v.length;
      })(),
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        const pos = cursorPos ?? s.cursorPosition ?? c.input.length;
        let newInput = c.input.slice(0, pos) + v + c.input.slice(pos);
        if (v === '(') {
          const openCount = (newInput.match(/\(/g) || []).length;
          const closeCount = (newInput.match(/\)/g) || []).length;
          if (openCount > closeCount) {
            newInput += ')';
          }
        }
        return { ...c, input: newInput };
      }),
    })),

  backspace: (id, cursorPos) =>
    set((s) => ({
      cursorPosition: (() => {
        const card = s.cards.find((c) => c.id === id);
        if (!card || !card.input) return s.cursorPosition;
        const pos = cursorPos ?? s.cursorPosition ?? card.input.length;
        if (pos <= 0) return 0;
        return pos - 1;
      })(),
      cards: s.cards.map((c) => {
        if (c.id !== id) return c;
        const input = c.input;
        if (!input) return c;

        const pos = cursorPos ?? s.cursorPosition ?? input.length;
        if (pos <= 0) return c;

        const before = input.slice(0, pos);
        const after = input.slice(pos);

        const FUNC_SUFFIXES = ['sin(', 'cos(', 'tan(', 'ln(', 'log(', 'exp(', 'sqrt(', 'abs(', 'asin(', 'acos(', 'atan(', 'sinh(', 'cosh(', 'tanh(', 'diff(', 'integrate(', 'simplify('];
        for (const suffix of FUNC_SUFFIXES) {
          if (before.endsWith(suffix)) {
            const openCount = (input.match(/\(/g) || []).length;
            const closeCount = (input.match(/\)/g) || []).length;
            if (openCount > closeCount) {
              return { ...c, input: before.slice(0, -suffix.length - 1) + after };
            }
            return { ...c, input: before.slice(0, -suffix.length) + after };
          }
        }

        const last = before[before.length - 1];
        const beforeMinusOne = before.slice(0, -1);
        if (last === ')' && beforeMinusOne.endsWith('(')) {
          return { ...c, input: beforeMinusOne.slice(0, -1) + after };
        }

        return { ...c, input: beforeMinusOne + after };
      }),
    })),

  clearInput: (id) =>
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, input: '', output: null } : c
      ),
    })),

  compute: async (id) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card || !card.input.trim()) return;

    // 取消之前的请求
    const prev = abortControllers.get(id);
    if (prev) prev.abort();

    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, computing: true } : c
      ),
    }));

    const controller = new AbortController();
    abortControllers.set(id, controller);

    // 简单的防抖延迟，避免频繁输入时不断触发计算
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });

    if (controller.signal.aborted) return;

    const output = await dispatch(card.input, controller.signal);

    if (controller.signal.aborted) return;

    abortControllers.delete(id);

    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === id ? { ...c, output, computing: false } : c
      ),
      history: [...s.history, { input: card.input, output }],
      historyIndex: null,
    }));
  },

  addGraphFn: (cardId, expr) => {
    if (!expr.trim()) return;
    const cleanExpr = expr.replace(/^y\s*=\s*/i, '').trim();
    if (!cleanExpr) return;
    set((s) => ({
      cards: s.cards.map((c) => {
        if (c.id !== cardId) return c;
        const color = COLORS[c.graphFunctions.length % COLORS.length];
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        return {
          ...c,
          graphFunctions: [...c.graphFunctions, { id, expr: cleanExpr, color, hidden: false }],
        };
      }),
    }));
  },

  removeGraphFn: (cardId, fnId) =>
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === cardId
          ? { ...c, graphFunctions: c.graphFunctions.filter((f) => f.id !== fnId) }
          : c
      ),
    })),

  clearGraphFns: (cardId) =>
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === cardId ? { ...c, graphFunctions: [] } : c
      ),
    })),

  updateGraphFn: (cardId, fnId, updates) =>
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === cardId
          ? { ...c, graphFunctions: c.graphFunctions.map((f) => f.id === fnId ? { ...f, ...updates } : f) }
          : c
      ),
    })),

  toggleGraphFnVisibility: (cardId, fnId) =>
    set((s) => ({
      cards: s.cards.map((c) =>
        c.id === cardId
          ? { ...c, graphFunctions: c.graphFunctions.map((f) => f.id === fnId ? { ...f, hidden: !f.hidden } : f) }
          : c
      ),
    })),

  toggleFullscreen: () => set((s) => ({ isFullscreen: !s.isFullscreen })),

  clearHistory: () => set({ history: [] }),

  loadHistoryItem: (input) => {
    const { cards, activeCardId } = get();
    const active = cards.find((c) => c.id === activeCardId);
    if (active && active.type === 'calculator') {
      set((s) => ({
        cards: s.cards.map((c) =>
          c.id === activeCardId ? { ...c, input, output: null } : c
        ),
      }));
    } else {
      const id = get().addCard('calculator');
      set((s) => ({
        cards: s.cards.map((c) =>
          c.id === id ? { ...c, input } : c
        ),
      }));
    }
  },

  navigateHistory: (direction) => {
    const { history, historyIndex, cards, activeCardId } = get();
    const active = cards.find((c) => c.id === activeCardId);
    if (!active || active.type !== 'calculator' || history.length === 0) return;

    let newIndex: number | null;
    if (direction === 'prev') {
      newIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
    } else {
      newIndex = historyIndex === null ? null : (historyIndex < history.length - 1 ? historyIndex + 1 : null);
    }

    const item = newIndex !== null ? history[newIndex] : null;
    set((s) => ({
      historyIndex: newIndex,
      cards: s.cards.map((c) =>
        c.id === activeCardId ? { ...c, input: item?.input ?? '', output: null } : c
      ),
    }));
  },

  setDragState: (s) => set({ dragState: s }),

  setCursorPosition: (pos) => set({ cursorPosition: pos }),

  getFirstCalcCard: () => get().cards.find((c) => c.type === 'calculator'),

  getFirstGraphCard: () => get().cards.find((c) => c.type === 'graph'),
}));
