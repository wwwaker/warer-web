import { evaluate } from 'mathjs';

export interface LocalResult {
  numeric_value: number | null;
  plain_text: string;
  is_symbolic: false;
}

const CLOUD_KEYWORDS = /\b(diff|derivative|int|integrate|solve|simplify|limit|series|matrix)\b/i;
const SYMBOLIC_VAR = /\b([a-zA-Z])\b(?!\s*\()/;

const LOCAL_CONSTANTS = new Set(['e', 'pi', 'E', 'PI']);

export function needsCloud(input: string): boolean {
  if (CLOUD_KEYWORDS.test(input)) return true;
  if (SYMBOLIC_VAR.test(input)) {
    const withoutFuncs = input.replace(/\b(sin|cos|tan|log|ln|exp|sqrt|abs|asin|acos|atan|sinh|cosh|tanh|ceil|floor|round)\b/gi, '');
    const matches = withoutFuncs.match(/\b([a-zA-Z])\b(?!\s*\()/g);
    if (matches && matches.some((m) => !LOCAL_CONSTANTS.has(m))) return true;
  }
  return false;
}

export function computeLocal(input: string): LocalResult | null {
  try {
    const preprocessed = input
      .replace(/^[yY]\s*=\s*/, '')
      .replace(/\^/g, '**')
      .replace(/\bln\b/gi, 'log')
      .replace(/π/g, 'pi');

    const result = evaluate(preprocessed);

    if (typeof result === 'number' && isFinite(result)) {
      return {
        numeric_value: result,
        plain_text: String(result),
        is_symbolic: false,
      };
    }

    return null;
  } catch {
    return null;
  }
}
