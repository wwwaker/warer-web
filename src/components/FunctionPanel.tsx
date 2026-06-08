import { useState, useRef, useEffect, useCallback } from 'react';

interface FnGroup {
  title: string;
  items: { label: string; value: string }[];
  defaultOpen: boolean;
}

const FN_GROUPS: FnGroup[] = [
  {
    title: '三角函数',
    defaultOpen: true,
    items: [
      { label: 'sin', value: 'sin(' },
      { label: 'cos', value: 'cos(' },
      { label: 'tan', value: 'tan(' },
      { label: 'asin', value: 'asin(' },
      { label: 'acos', value: 'acos(' },
      { label: 'atan', value: 'atan(' },
      { label: 'sinh', value: 'sinh(' },
      { label: 'cosh', value: 'cosh(' },
      { label: 'tanh', value: 'tanh(' },
    ],
  },
  {
    title: '符号变量',
    defaultOpen: true,
    items: [
      { label: 'x', value: 'x' },
      { label: 'y', value: 'y' },
      { label: 't', value: 't' },
      { label: 'θ', value: 'theta' },
    ],
  },
  {
    title: '高级计算',
    defaultOpen: false,
    items: [
      { label: 'diff', value: 'diff(' },
      { label: 'integrate', value: 'integrate(' },
      { label: 'solve', value: 'solve(' },
      { label: 'nsolve', value: 'nsolve(' },
      { label: 'dsolve', value: 'dsolve(' },
      { label: 'linsolve', value: 'linsolve(' },
      { label: 'limit', value: 'limit(' },
      { label: 'series', value: 'series(' },
      { label: 'simplify', value: 'simplify(' },
    ],
  },
  {
    title: '矩阵运算',
    defaultOpen: false,
    items: [
      { label: 'det', value: 'det(' },
      { label: 'inv', value: 'inv(' },
      { label: 'transpose', value: 'transpose(' },
      { label: 'eigenvals', value: 'eigenvals(' },
      { label: 'eigenvects', value: 'eigenvects(' },
      { label: 'rank', value: 'rank(' },
    ],
  },
];

interface TemplateItem {
  label: string;
  expr: string;
  desc: string;
  group: string;
}

const TEMPLATES: TemplateItem[] = [
  { label: '求导', expr: 'diff(x^3 + 2*x, x)', desc: '计算多项式导数', group: '微积分' },
  { label: '积分', expr: 'integrate(x^2, x)', desc: '计算不定积分', group: '微积分' },
  { label: '定积分', expr: 'integrate(x^2, x, 0, 1)', desc: '计算定积分', group: '微积分' },
  { label: '求根', expr: 'solve(x^2 - 4, x)', desc: '解一元二次方程', group: '方程' },
  { label: '数值求根', expr: 'nsolve(x^5-x-1, x, 1)', desc: '数值方法求根', group: '方程' },
  { label: '方程组', expr: 'linsolve([x+y-1, x-y-3], [x, y])', desc: '解线性方程组', group: '方程' },
  { label: '微分方程', expr: 'dsolve(diff(f(x), x) - f(x), f(x))', desc: '解常微分方程', group: '方程' },
  { label: '极限', expr: 'limit(sin(x)/x, x, 0)', desc: '计算极限', group: '分析' },
  { label: '泰勒展开', expr: 'series(sin(x), x, 0, 5)', desc: '泰勒级数展开', group: '分析' },
  { label: '化简', expr: 'simplify(cos(x)^2 + sin(x)^2)', desc: '三角恒等式化简', group: '化简' },
  { label: '2x2 矩阵', expr: '[[1, 2], [3, 4]]', desc: '2×2 矩阵', group: '矩阵' },
  { label: '3x3 矩阵', expr: '[[1, 2, 3], [4, 5, 6], [7, 8, 9]]', desc: '3×3 矩阵', group: '矩阵' },
  { label: '行列式', expr: 'det([[1, 2], [3, 4]])', desc: '计算矩阵行列式', group: '矩阵' },
  { label: '逆矩阵', expr: 'inv([[1, 2], [3, 4]])', desc: '求逆矩阵', group: '矩阵' },
  { label: '特征值', expr: 'eigenvals([[1, 2], [3, 4]])', desc: '计算特征值', group: '矩阵' },
  { label: '转置', expr: 'transpose([[1, 2], [3, 4]])', desc: '矩阵转置', group: '矩阵' },
];

type PanelTab = 'fn' | 'tpl';

interface Props {
  onInsert: (value: string) => void;
  onTemplate: (expr: string) => void;
}

export default function FunctionPanel({ onInsert, onTemplate }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    FN_GROUPS.forEach((g) => {
      if (g.defaultOpen) initial.add(g.title);
    });
    return initial;
  });
  const [tplOpenGroups, setTplOpenGroups] = useState<Set<string>>(() => {
    // 模板分组默认全部展开
    return new Set(Array.from(new Set(TEMPLATES.map((t) => t.group))));
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const toggleTplGroup = (group: string) => {
    setTplOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const close = useCallback(() => setActiveTab(null), []);

  useEffect(() => {
    if (activeTab === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [activeTab, close]);

  const handleTabClick = (tab: PanelTab) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  const handleInsert = (value: string) => {
    onInsert(value);
  };

  const handleTemplate = (expr: string) => {
    onTemplate(expr);
    close();
  };

  return (
    <div className="fn-panel">
      <div className="fn-panel-triggers" ref={triggerRef}>
        <button
          className={`fn-trigger${activeTab === 'fn' ? ' active' : ''}`}
          onClick={() => handleTabClick('fn')}
        >
          ƒ 函数
        </button>
        <button
          className={`fn-trigger${activeTab === 'tpl' ? ' active' : ''}`}
          onClick={() => handleTabClick('tpl')}
        >
          ✦ 模板
        </button>
      </div>

      {activeTab !== null && (
        <div className="fn-panel-popover" ref={panelRef}>
          <div className="fn-popover-header">
            <span className="fn-popover-title">
              {activeTab === 'fn' ? '函数与变量' : '常用模板'}
            </span>
            <button className="fn-popover-close" onClick={close}>✕</button>
          </div>
          <div className="fn-popover-body">
            {activeTab === 'fn' && FN_GROUPS.map((group) => (
              <div key={group.title} className="fn-group">
                <button
                  className="fn-group-toggle"
                  onClick={() => toggleGroup(group.title)}
                >
                  <span className={`fn-group-icon${openGroups.has(group.title) ? ' open' : ''}`} />
                  {group.title}
                  <span className="fn-group-count">{group.items.length}</span>
                </button>
                <div className={`fn-group-collapse${openGroups.has(group.title) ? ' open' : ''}`}>
                  <div className="fn-group-items">
                    {group.items.map((item) => (
                      <button
                        key={item.value + item.label}
                        className="fn-item"
                        onClick={() => handleInsert(item.value)}
                        title={item.value}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {activeTab === 'tpl' && Array.from(new Set(TEMPLATES.map((t) => t.group))).map((groupName) => (
              <div key={groupName} className="fn-group">
                <button
                  className="fn-group-toggle"
                  onClick={() => toggleTplGroup(groupName)}
                >
                  <span className={`fn-group-icon${tplOpenGroups.has(groupName) ? ' open' : ''}`} />
                  {groupName}
                  <span className="fn-group-count">{TEMPLATES.filter((t) => t.group === groupName).length}</span>
                </button>
                <div className={`fn-group-collapse${tplOpenGroups.has(groupName) ? ' open' : ''}`}>
                  <div className="fn-group-items">
                    {TEMPLATES.filter((t) => t.group === groupName).map((t) => (
                      <button
                        key={t.expr}
                        className="fn-template-btn"
                        title={t.desc}
                        onClick={() => handleTemplate(t.expr)}
                      >
                        <span className="fn-template-label">{t.label}</span>
                        <span className="fn-template-desc">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
