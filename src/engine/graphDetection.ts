import type { GraphMode } from '../store/calculatorStore';

export interface DetectionResult {
  type: GraphMode;
  expr: string;
  xExpr?: string;
  yExpr?: string;
}

const KNOWN_FUNC_REGEX = /\b(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|asinh|acosh|atanh|log|ln|exp|sqrt|abs|cbrt|sign|ceil|floor|round|nthRoot|factorial)\s*\(/gi;

/**
 * Parse content inside parentheses starting at a given position.
 * Uses depth-counting to correctly handle nested parens.
 * Returns null if parentheses are unbalanced or content doesn't extend to end of string.
 */
function parseParenContent(input: string, startPos: number): string | null {
  let depth = 1;
  let i = startPos;

  while (i < input.length && depth > 0) {
    const ch = input[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }

  if (depth !== 0) return null;
  // Must consume the entire remaining string (only the closing paren remains)
  if (i !== input.length - 1) return null;

  const inner = input.slice(startPos, i).trim();
  return inner || null;
}

/**
 * Parse two comma-separated arguments inside parentheses starting at a given position.
 * Finds the first comma at depth 1 to correctly split arguments.
 * Returns null if parsing fails.
 */
function parseTwoArgContent(
  input: string,
  startPos: number,
): { xExpr: string; yExpr: string } | null {
  let depth = 1;
  let i = startPos;
  let commaPos = -1;

  while (i < input.length && depth > 0) {
    const ch = input[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) break;
    }
    if (depth === 1 && ch === ',' && commaPos === -1) {
      commaPos = i;
    }
    i++;
  }

  if (depth !== 0) return null;
  if (i !== input.length - 1) return null;
  if (commaPos === -1) return null;

  const xExpr = input.slice(startPos, commaPos).trim();
  const yExpr = input.slice(commaPos + 1, i).trim();

  if (!xExpr || !yExpr) return null;

  return { xExpr, yExpr };
}

/**
 * Try to detect graph function type using explicit notation:
 *   - y(expr)       → linear, inner expr
 *   - r(expr)       → polar, inner expr
 *   - theta(expr)   → polar, inner expr
 *   - t(x, y)       → parametric, split x/y expressions
 *   - f(expr)       → implicit, inner expr
 *
 * Returns null if no explicit notation is matched.
 */
function tryExplicitNotation(input: string): DetectionResult | null {
  const lower = input.toLowerCase().trim();

  // y(expr) → linear
  if (lower.startsWith('y(')) {
    const inner = parseParenContent(input, 'y('.length);
    if (inner !== null) {
      return { type: 'linear', expr: inner };
    }
  }

  // r(expr) or theta(expr) → polar
  if (lower.startsWith('r(')) {
    const inner = parseParenContent(input, 'r('.length);
    if (inner !== null) {
      return { type: 'polar', expr: inner };
    }
  }
  if (lower.startsWith('theta(')) {
    const inner = parseParenContent(input, 'theta('.length);
    if (inner !== null) {
      return { type: 'polar', expr: inner };
    }
  }

  // t(xExpr, yExpr) → parametric
  if (lower.startsWith('t(')) {
    const result = parseTwoArgContent(input, 't('.length);
    if (result) {
      return {
        type: 'parametric',
        expr: input,
        xExpr: result.xExpr,
        yExpr: result.yExpr,
      };
    }
  }

  // f(expr) → implicit
  if (lower.startsWith('f(')) {
    const inner = parseParenContent(input, 'f('.length);
    if (inner !== null) {
      return { type: 'implicit', expr: inner };
    }
  }

  return null;
}

/**
 * Fallback heuristic detection when no explicit notation is found:
 *   - Contains 'theta' as a word     → polar
 *   - Starts with diff/int/solve/...  → linear
 *   - Has standalone y after removing known func calls → implicit
 *   - Default                        → linear
 */
function heuristicDetection(input: string): DetectionResult {
  const lower = input.toLowerCase();

  // If input contains 'theta' as a word → polar
  if (/\btheta\b/.test(lower)) {
    return { type: 'polar', expr: input };
  }

  // If starts with a symbolic command keyword → linear
  if (/^(?:diff|int(?:egrate)?|solve|simplify)\s*\(/i.test(input.trim())) {
    return { type: 'linear', expr: input };
  }

  // After removing y= prefix and known function calls, if standalone y remains → implicit
  const noPrefix = input.replace(/^y\s*=\s*/i, '').trim();
  const knownFuncStripped = noPrefix.replace(KNOWN_FUNC_REGEX, '');
  if (/\by\b/.test(knownFuncStripped)) {
    return { type: 'implicit', expr: noPrefix };
  }

  // Default → linear
  return { type: 'linear', expr: input };
}

/**
 * Detect the graph function type from an expression string.
 *
 * First tries explicit notation (y(...), r(...), theta(...), t(...), f(...)),
 * then falls back to heuristic detection based on content analysis.
 *
 * @param expr - The raw expression string to analyze.
 * @returns A DetectionResult with the detected type and parsed expression(s).
 */
export function detectGraphFnType(expr: string): DetectionResult {
  const trimmed = expr.trim();
  if (!trimmed) return { type: 'linear', expr: '' };

  // 1. Try explicit notation
  const explicit = tryExplicitNotation(trimmed);
  if (explicit) return explicit;

  // 2. Heuristic fallback
  return heuristicDetection(trimmed);
}
