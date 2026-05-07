import { useCalculator } from '../store/calculatorStore';

const KEYS: { label: string; value: string; span?: number; cls?: string }[][] = [
  [
    { label: 'sin', value: 'sin(' },
    { label: 'cos', value: 'cos(' },
    { label: 'tan', value: 'tan(' },
    { label: 'ln', value: 'ln(' },
    { label: '⌫', value: 'BACKSPACE', cls: 'fn' },
    { label: 'C', value: 'CLEAR', cls: 'fn' },
  ],
  [
    { label: '7', value: '7' },
    { label: '8', value: '8' },
    { label: '9', value: '9' },
    { label: '÷', value: '/' },
    { label: '^', value: '^' },
    { label: 'π', value: 'pi' },
  ],
  [
    { label: '4', value: '4' },
    { label: '5', value: '5' },
    { label: '6', value: '6' },
    { label: '×', value: '*' },
    { label: '(', value: '(' },
    { label: ')', value: ')' },
  ],
  [
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '−', value: '-' },
    { label: '√', value: 'sqrt(' },
    { label: 'e', value: 'e' },
  ],
  [
    { label: '0', value: '0', span: 2 },
    { label: '.', value: '.' },
    { label: '+', value: '+' },
    { label: '=', value: 'COMPUTE', cls: 'accent' },
  ],
  [
    { label: 'diff', value: 'diff(', cls: 'cloud' },
    { label: 'int', value: 'integrate(', cls: 'cloud' },
    { label: 'x', value: 'x', cls: 'cloud' },
    { label: 'y', value: 'y', cls: 'cloud' },
    { label: ',', value: ', ' },
    { label: 'simp', value: 'simplify(', cls: 'cloud' },
  ],
];

interface Props {
  tabId: string;
}

export default function Keyboard({ tabId }: Props) {
  const { appendInput, backspace, clearInput, compute } = useCalculator();

  const handleKey = (value: string) => {
    switch (value) {
      case 'BACKSPACE':
        backspace(tabId);
        break;
      case 'CLEAR':
        clearInput(tabId);
        break;
      case 'COMPUTE':
        compute(tabId);
        break;
      default:
        appendInput(tabId, value);
    }
  };

  return (
    <div className="keyboard">
      {KEYS.map((row, ri) => (
        <div key={ri} className="keyboard-row">
          {row.map((k) => (
            <button
              key={k.value + k.label}
              className={`key ${k.cls ?? ''}`}
              style={k.span ? { gridColumn: `span ${k.span}` } : undefined}
              onClick={() => handleKey(k.value)}
              aria-label={k.label}
            >
              {k.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
