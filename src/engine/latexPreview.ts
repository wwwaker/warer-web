type Token =
  | { type: 'number'; value: string }
  | { type: 'variable'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'func'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'lsq' }
  | { type: 'rsq' }
  | { type: 'comma' }
  | { type: 'caret' }
  | { type: 'slash' };

const KNOWN_FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh',
  'ln', 'log', 'exp', 'sqrt',
  'abs', 'ceil', 'floor', 'round',
  'diff', 'derivative', 'integrate', 'int',
  'simplify', 'solve', 'nsolve', 'dsolve', 'linsolve',
  'limit', 'series', 'taylor',
  'det', 'inv', 'inverse', 'transpose', 'eigenvals', 'eigenvects', 'rank',
]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.replace(/^y\s*=\s*/i, '');

  while (i < s.length) {
    const ch = s[i];

    if (/\s/.test(ch)) { i++; continue; }

    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i++]; }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let name = '';
      while (i < s.length && /[a-zA-Z]/.test(s[i])) { name += s[i++]; }
      if (KNOWN_FUNCS.has(name)) {
        tokens.push({ type: 'func', value: name });
      } else if (name === 'pi') {
        tokens.push({ type: 'variable', value: '\\pi' });
      } else if (name === 'theta') {
        tokens.push({ type: 'variable', value: '\\theta' });
      } else if (name === 'i' || name === 'j') {
        tokens.push({ type: 'variable', value: 'i' });
      } else if (name === 'e' && (i >= s.length || !/[a-zA-Z]/.test(s[i]))) {
        tokens.push({ type: 'variable', value: 'e' });
      } else {
        tokens.push({ type: 'variable', value: name });
      }
      continue;
    }

    if (ch === '^') { tokens.push({ type: 'caret' }); i++; continue; }
    if (ch === '/') { tokens.push({ type: 'slash' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (ch === '[') { tokens.push({ type: 'lsq' }); i++; continue; }
    if (ch === ']') { tokens.push({ type: 'rsq' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    if (ch === '*') {
      // Handle ** and *** patterns: ** is power, *** is power then multiply
      if (i + 1 < s.length && s[i + 1] === '*') {
        tokens.push({ type: 'caret' });
        i += 2;
        // If there's a third *, treat as multiplication
        if (i < s.length && s[i] === '*') {
          tokens.push({ type: 'operator', value: '\\cdot ' });
          i++;
        }
        continue;
      }
      tokens.push({ type: 'operator', value: '\\cdot ' });
      i++;
      continue;
    }
    if (ch === '·') { tokens.push({ type: 'operator', value: '\\cdot ' }); i++; continue; }
    if (ch === '+') { tokens.push({ type: 'operator', value: '+' }); i++; continue; }
    if (ch === '-') { tokens.push({ type: 'operator', value: '-' }); i++; continue; }

    i++;
  }

  return tokens;
}

function insertImplicitMultiplication(tokens: Token[]): Token[] {
  if (tokens.length <= 1) return tokens;

  const result: Token[] = [tokens[0]];

  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const cur = tokens[i];

    const needMul =
      (prev.type === 'number' && (cur.type === 'variable' || cur.type === 'lparen' || cur.type === 'func')) ||
      (prev.type === 'rparen' && (cur.type === 'variable' || cur.type === 'number' || cur.type === 'lparen' || cur.type === 'func')) ||
      (prev.type === 'variable' && (cur.type === 'lparen' || cur.type === 'number' || cur.type === 'func'));

    if (needMul) {
      result.push({ type: 'operator', value: '\\cdot ' });
    }

    result.push(cur);
  }

  return result;
}

class Parser {
  private tokens: Token[];
  private pos: number;
  public errorMessage: string | null = null;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private advance(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos++] : null;
  }

  private peekOpValue(): string | null {
    const t = this.peek();
    return t?.type === 'operator' ? t.value : null;
  }

  parse(): string {
    return this.parseExpression();
  }

  private parseExpression(): string {
    const parts: string[] = [];
    parts.push(this.parseTerm());

    while (this.peekOpValue() !== null && this.peekOpValue() !== '\\cdot ') {
      const op = this.advance()!;
      const right = this.parseTerm();
      parts.push(` ${op.type === 'operator' ? op.value : ''} ${right}`);
    }

    return parts.join('');
  }

  private parseTerm(): string {
    let result = this.parsePower();

    while (true) {
      if (this.peekOpValue() === '\\cdot ') {
        this.advance();
        const right = this.parsePower();
        result = `${result} \\cdot ${right}`;
      } else if (this.peek()?.type === 'slash') {
        this.advance();
        const denominator = this.parsePower();
        result = `\\frac{${result}}{${denominator}}`;
      } else {
        break;
      }
    }

    return result;
  }

  private parsePower(): string {
    const base = this.parseUnary();

    if (this.peek()?.type === 'caret') {
      this.advance();
      const next = this.peek();
      // If the next token is an operator (not a value), this is `2^*2` style error
      if (next && (next.type === 'operator' || next.type === 'slash' || next.type === 'comma' || next.type === 'rparen' || next.type === 'rsq')) {
        if (!this.errorMessage) {
          this.errorMessage = `表达式不完整：'${base} ^' 后面缺少指数`;
        }
        return `${base}^{\\square}`;
      }
      const exp = this.parsePower();
      if (!exp) {
        if (!this.errorMessage) {
          this.errorMessage = `表达式不完整：'${base} ^' 后面缺少指数`;
        }
        return `${base}^{\\square}`;
      }

      if (base.includes('\\left(') && base.includes('\\right)')) {
        const match = base.match(/^(\\\w+)\\left\((.+)\\right\)$/);
        if (match) {
          const funcName = match[1];
          const args = match[2];
          return `${funcName}^{${exp}}{\\left(${args}\\right)}`;
        }
      }

      return `${base}^{${exp}}`;
    }

    return base;
  }

  private parseUnary(): string {
    if (this.peekOpValue() === '-') {
      this.advance();
      const operand = this.parseAtom();
      return `-${operand}`;
    }
    return this.parseAtom();
  }

  /** Parse a comma-separated argument list: arg1, arg2, ... ) */
  private parseArgsUntilRparen(): string[] {
    const args: string[] = [];
    // Already consumed the lparen before calling this
    while (this.pos < this.tokens.length) {
      const t = this.peek();
      if (!t) break;
      if (t.type === 'rparen') {
        this.advance(); // consume )
        break;
      }
      if (t.type === 'comma') {
        this.advance(); // consume ,
        continue;
      }
      args.push(this.parseExpression());
    }
    return args;
  }

  /** Parse a matrix literal: [[row1],[row2],...] */
  private parseMatrixLiteral(): string {
    // We're at the first '[' - handle [[...]] pattern
    const rows: string[] = [];
    
    // scan ahead to detect the double-bracket pattern
    // We already consumed first '[', check if next is also '['
    // Actually we haven't consumed anything yet. Let me change the approach.

    // This is called from parseAtom when we see 'lsq'
    // Check if the next token after this '[' is another '['
    const savedPos = this.pos;
    
    // Try to parse as matrix: [[r1c1,r1c2,...],[r2c1,...],...]
    this.advance(); // consume first '['
    
    if (this.peek()?.type === 'lsq') {
      // Matrix! Parse rows
      while (this.pos < this.tokens.length) {
        const t = this.peek();
        if (!t) break;
        if (t.type === 'rsq') {
          this.advance(); // consume ']'
          // Check if next is another ']' (end of matrix) or ',' or '[' (more rows)
          if (this.peek()?.type === 'rsq') {
            this.advance(); // consume closing ']'
            break;
          }
          // It was just a closing bracket within a row - unexpected
          continue;
        }
        if (t.type === 'lsq') {
          this.advance(); // consume '['
          // Parse row contents (comma-separated)
          const cells: string[] = [];
          while (this.pos < this.tokens.length) {
            const ct = this.peek();
            if (!ct) break;
            if (ct.type === 'rsq') {
              this.advance();
              break;
            }
            if (ct.type === 'comma') {
              this.advance();
              continue;
            }
            cells.push(this.parseExpression());
          }
          rows.push(cells.join(' & '));
          
          if (this.peek()?.type === 'comma') {
            this.advance(); // consume row separator
          }
          continue;
        }
        break;
      }
    } else {
      // Not a matrix, just a regular bracket. Restore and handle as ordinary bracket.
      this.pos = savedPos;
      return '';
    }

    if (rows.length > 0) {
      return `\\begin{pmatrix}${rows.join(' \\\\ ')}\\\end{pmatrix}`;
    }
    return '';
  }

  private parseAtom(): string {
    const token = this.peek();

    if (!token) return '';

    if (token.type === 'number') {
      this.advance();
      return token.value;
    }

    if (token.type === 'variable') {
      this.advance();
      return token.value;
    }

    // Matrix literal [[...]]
    if (token.type === 'lsq') {
      const matrix = this.parseMatrixLiteral();
      if (matrix) return matrix;
      // Fall back to regular bracket
      this.advance();
      return '\\left[';
    }

    if (token.type === 'rsq') {
      this.advance();
      return '\\right]';
    }

    if (token.type === 'func') {
      this.advance();
      const funcName = token.value;

      // Special LaTeX names for functions
      const funcLatexMap: Record<string, string> = {
        sin: '\\sin', cos: '\\cos', tan: '\\tan',
        asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
        sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
        ln: '\\ln', log: '\\log', exp: '\\exp',
        abs: '\\left|', ceil: '\\lceil', floor: '\\lfloor',
        diff: '\\frac{d}{dx}', derivative: '\\frac{d}{dx}',
        integrate: '\\int', int: '\\int',
        simplify: '\\text{simplify}',
        solve: '\\text{solve}',
        nsolve: '\\text{nsolve}',
        dsolve: '\\text{dsolve}',
        linsolve: '\\text{linsolve}',
        limit: '\\lim',
        series: '\\text{series}',
        taylor: '\\text{taylor}',
        det: '\\det',
        inv: '\\operatorname{inv}',
        inverse: '\\operatorname{inv}',
        transpose: '\\operatorname{T}',
        eigenvals: '\\text{eigenvals}',
        eigenvects: '\\text{eigenvects}',
        rank: '\\text{rank}',
      };

      const latexName = funcLatexMap[funcName] || `\\operatorname{${funcName}}`;

      // sqrt special case
      if (funcName === 'sqrt') {
        if (this.peek()?.type === 'lparen') {
          this.advance();
          const args = this.parseArgsUntilRparen();
          return `\\sqrt{${args.join(',\\ ')}}`;
        }
        return '\\sqrt{}';
      }

      // abs special case
      if (funcName === 'abs') {
        if (this.peek()?.type === 'lparen') {
          this.advance();
          const args = this.parseArgsUntilRparen();
          return `\\left|${args.join(',\\ ')}\\right|`;
        }
        return '\\left|\\right|';
      }

      // limit: beautiful notation \lim_{x \to 0} f(x)
      if (funcName === 'limit' && this.peek()?.type === 'lparen') {
        this.advance();
        const args = this.parseArgsUntilRparen();
        if (args.length >= 3) {
          // Optional 4th arg: direction '+' or '-'
          let arrow = `\\to ${args[2]}`;
          if (args.length >= 4) {
            const dir = args[3].replace(/['"]/g, '');
            if (dir === '+') arrow = `\\to ${args[2]}^{+}`;
            else if (dir === '-') arrow = `\\to ${args[2]}^{-}`;
          }
          return `\\lim_{${args[1]} ${arrow}} ${args[0]}`;
        }
        return `${latexName}\\left(${args.join(',\\ ')}\\right)`;
      }

      // diff via _split pattern: diff(expr, var)
      if ((funcName === 'diff' || funcName === 'derivative') && this.peek()?.type === 'lparen') {
        this.advance();
        const args = this.parseArgsUntilRparen();
        if (args.length >= 2) {
          return `\\frac{d}{d ${args[1]}}\\left(${args[0]}\\right)`;
        }
        return `\\frac{d}{dx}\\left(${args.join(',\\ ')}\\right)`;
      }

      // integrate: indefinite (2 args) or definite (4 args)
      if ((funcName === 'integrate' || funcName === 'int') && this.peek()?.type === 'lparen') {
        this.advance();
        const args = this.parseArgsUntilRparen();
        if (args.length >= 4) {
          // Definite integral: \int_{lower}^{upper} expr \, dvar
          return `\\int_{${args[2]}}^{${args[3]}} ${args[0]} \\, d${args[1]}`;
        }
        if (args.length >= 2) {
          return `\\int ${args[0]} \\, d${args[1]}`;
        }
        return `\\int ${args.join(',\\ ')} \\, dx`;
      }

      // transpose: show as matrix^T
      if (funcName === 'transpose' && this.peek()?.type === 'lparen') {
        this.advance();
        const args = this.parseArgsUntilRparen();
        return `\\left(${args.join(',\\ ')}\\right)^{T}`;
      }

      // Generic function with arguments
      if (this.peek()?.type === 'lparen') {
        this.advance();
        const args = this.parseArgsUntilRparen();
        return `${latexName}\\left(${args.join(',\\ ')}\\right)`;
      }

      return latexName;
    }

    if (token.type === 'lparen') {
      this.advance();
      const inner = this.parseExpression();
      if (this.peek()?.type === 'rparen') this.advance();
      // Decide whether to keep visible parentheses.
      // Keep them if (a) followed by ^ (will be raised to a power),
      // (b) inside contains binary operators like +,- which need grouping,
      // (c) followed by an operator that could be ambiguous (·, /, *).
      const next = this.peek();
      const hasAddition = / \+ | \- /.test(` ${inner} `);
      const wrapInParens =
        next?.type === 'caret' ||
        hasAddition ||
        next?.type === 'slash' ||
        next?.type === 'operator';
      if (wrapInParens) {
        return `\\left(${inner}\\right)`;
      }
      return inner;
    }

    this.advance();
    return '';
  }
}

export function inputToLatex(input: string): string {
  if (!input.trim()) return '';

  // Handle solve/nsolve: show as "expression = 0"
  const solveMatch = input.match(/^(solve|nsolve)\s*\(/i);
  if (solveMatch) {
    const firstArg = extractFirstArg(input, solveMatch[0].length);
    if (firstArg) {
      const parsed = inputToLatexInner(firstArg);
      if (parsed) return `${parsed} = 0`;
    }
  }

  // Handle linsolve: show as system of equations
  const linsolveMatch = input.match(/^linsolve\s*\(/i);
  if (linsolveMatch) {
    const firstArg = extractFirstArg(input, linsolveMatch[0].length);
    if (firstArg) {
      const eqs = parseEquationList(firstArg);
      if (eqs.length > 0) {
        const eqLines = eqs.map((eq) => {
          const parsed = inputToLatexInner(eq);
          return `${parsed} = 0`;
        });
        return `\\begin{cases}${eqLines.join(' \\\\ ')}\\\\end{cases}`;
      }
    }
  }

  return inputToLatexInner(input);
}

/** Extract the first argument from a function call like solve(expr, var) */
function extractFirstArg(input: string, parenStart: number): string | null {
  let parenDepth = 1;
  let bracketDepth = 0;
  let i = parenStart;
  while (i < input.length && parenDepth > 0) {
    const ch = input[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;
    else if (ch === ',' && parenDepth === 1 && bracketDepth === 0) {
      return input.slice(parenStart, i).trim();
    }
    i++;
  }
  // No comma found, the entire content is the first arg
  if (parenDepth === 0) {
    const inner = input.slice(parenStart, i - 1).trim();
    return inner || null;
  }
  return null;
}

/** Parse a bracketed equation list like [x+y-1, x-y-3] into individual equations */
function parseEquationList(raw: string): string[] {
  let s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    s = s.slice(1, -1).trim();
  }
  // Split by commas at depth 0
  const eqs: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      eqs.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  eqs.push(s.slice(start).trim());
  return eqs.filter((e) => e.length > 0);
}

function inputToLatexInner(input: string): string {
  try {
    const rawTokens = tokenize(input);
    if (rawTokens.length === 0) return '';
    const tokens = insertImplicitMultiplication(rawTokens);
    const parser = new Parser(tokens);
    return parser.parse();
  } catch {
    return input.replace(/\^/g, '^');
  }
}