import { evaluate } from 'mathjs';

export interface LocalResult {
  numeric_value: number | null;
  plain_text: string;
  is_symbolic: false;
}

const CLOUD_KEYWORDS = /\b(diff|derivative|int|integrate|solve|nsolve|dsolve|linsolve|limit|series|taylor|simplify|matrix)\b/i;
const SYMBOLIC_VAR = /\b([a-zA-Z])\b(?!\s*\()/;

const LOCAL_CONSTANTS = new Set(['e', 'pi', 'E', 'PI']);

const KNOWN_FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'sqrt',
  'abs', 'ceil', 'floor', 'round',
]);

function smartRound(value: number, tolerance: number = 1e-10): string {
  const nearestInt = Math.round(value);
  if (Math.abs(value - nearestInt) < tolerance) {
    return String(nearestInt);
  }

  const commonFractions = [
    [0, 1],
    [1, 6], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [5, 6],
    [1, 8], [3, 8], [5, 8], [7, 8],
    [1, 12], [5, 12], [7, 12], [11, 12],
  ];
  
  for (const [num, den] of commonFractions) {
    const fractionValue = num / den;
    if (Math.abs(value - fractionValue) < tolerance) {
      if (num === 0) return "0";
      if (den === 1) return String(num);
      return `${num}/${den}`;
    }
    if (Math.abs(value + fractionValue) < tolerance) {
      if (num === 0) return "0";
      if (den === 1) return String(-num);
      return `-${num}/${den}`;
    }
  }
  
  try {
    let bestNum = 1;
    let bestDen = 1;
    let bestError = Math.abs(value - Math.round(value));
    
    for (let den = 2; den <= 20; den++) {
      const num = Math.round(value * den);
      const error = Math.abs(value - num / den);
      if (error < bestError) {
        bestError = error;
        bestNum = num;
        bestDen = den;
      }
    }
    
    if (bestError < tolerance * 100 && bestDen <= 20) {
      if (bestDen === 1) return String(bestNum);
      return `${bestNum}/${bestDen}`;
    }
  } catch {
    // 忽略错误，使用默认格式化
  }

  const formatted = value.toFixed(10).replace(/\.?0+$/, '');
  return formatted;
}

export function needsCloud(input: string): boolean {
  if (CLOUD_KEYWORDS.test(input)) return true;
  if (SYMBOLIC_VAR.test(input)) {
    const withoutFuncs = input.replace(/\b(sin|cos|tan|log|ln|exp|sqrt|abs|asin|acos|atan|sinh|cosh|tanh|ceil|floor|round)\b/gi, '');
    const matches = withoutFuncs.match(/\b([a-zA-Z])\b(?!\s*\()/g);
    if (matches && matches.some((m) => !LOCAL_CONSTANTS.has(m))) return true;
  }
  return false;
}

function preprocessImplicitMultiplication(input: string): string {
  const tokens: { type: 'func' | 'var' | 'num' | 'op' | 'lparen' | 'rparen'; value: string }[] = [];
  let i = 0;
  const s = input;

  while (i < s.length) {
    const ch = s[i];

    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i++]; }
      tokens.push({ type: 'num', value: num });
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let name = '';
      while (i < s.length && /[a-zA-Z]/.test(s[i])) { name += s[i++]; }
      if (KNOWN_FUNCS.has(name)) {
        tokens.push({ type: 'func', value: name });
      } else if (name === 'pi') {
        tokens.push({ type: 'var', value: 'pi' });
      } else if (name === 'e') {
        tokens.push({ type: 'var', value: 'e' });
      } else {
        tokens.push({ type: 'var', value: name });
      }
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    tokens.push({ type: 'op', value: ch }); i++;
  }

  const result: string[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const cur = tokens[j];
    const prev = j > 0 ? tokens[j - 1] : null;

    if (prev) {
      const needMul =
        (prev.type === 'num' && (cur.type === 'var' || cur.type === 'lparen' || cur.type === 'func')) ||
        (prev.type === 'rparen' && (cur.type === 'var' || cur.type === 'num' || cur.type === 'lparen' || cur.type === 'func')) ||
        (prev.type === 'var' && (cur.type === 'lparen' || cur.type === 'num' || cur.type === 'func'));
      if (needMul) result.push('*');
    }

    result.push(cur.value);
  }

  return result.join('');
}

export function computeLocal(input: string): LocalResult | null {
  try {
    const preprocessed = input
      .replace(/^[yY]\s*=\s*/, '')
      .replace(/\^/g, '**')
      .replace(/\bln\b/gi, 'log')
      .replace(/π/g, 'pi');

    const withImplicitMul = preprocessImplicitMultiplication(preprocessed);

    const result = evaluate(withImplicitMul);

    if (typeof result === 'number' && isFinite(result)) {
      const roundedText = smartRound(result);
      return {
        numeric_value: result,
        plain_text: roundedText,
        is_symbolic: false,
      };
    }

    return null;
  } catch {
    return null;
  }
}
