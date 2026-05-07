type Token =
  | { type: 'number'; value: string }
  | { type: 'variable'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'func'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' }
  | { type: 'caret' }
  | { type: 'slash' };

const KNOWN_FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh',
  'ln', 'log', 'exp', 'sqrt',
  'abs', 'ceil', 'floor', 'round',
  'diff', 'derivative', 'integrate', 'int', 'simplify',
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
    if (ch === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    if (ch === '*' || ch === '·') { tokens.push({ type: 'operator', value: '\\cdot ' }); i++; continue; }
    if (ch === '+') { tokens.push({ type: 'operator', value: '+' }); i++; continue; }
    if (ch === '-') { tokens.push({ type: 'operator', value: '-' }); i++; continue; }

    i++;
  }

  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos: number;

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
    const result = this.parseExpression();
    return result;
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
    const parts: string[] = [];
    parts.push(this.parsePower());

    while (this.peekOpValue() === '\\cdot ') {
      this.advance();
      const right = this.parsePower();
      parts.push(` \\cdot ${right}`);
    }

    if (this.peek()?.type === 'slash') {
      this.advance();
      const right = this.parsePower();
      return `\\frac{${parts.join('')}}{${right}}`;
    }

    return parts.join('');
  }

  private parsePower(): string {
    const base = this.parseUnary();

    if (this.peek()?.type === 'caret') {
      this.advance();
      const exp = this.parsePower();
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

    if (token.type === 'func') {
      this.advance();
      const funcName = token.value;

      const funcLatex: Record<string, string> = {
        sin: '\\sin', cos: '\\cos', tan: '\\tan',
        asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
        sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
        ln: '\\ln', log: '\\log', exp: '\\exp',
        abs: '\\left|', ceil: '\\lceil', floor: '\\lfloor',
        diff: '\\frac{d}{dx}', derivative: '\\frac{d}{dx}',
        integrate: '\\int', int: '\\int',
        simplify: '\\text{simplify}',
      };

      const latexName = funcLatex[funcName] || `\\operatorname{${funcName}}`;

      if (funcName === 'sqrt') {
        if (this.peek()?.type === 'lparen') {
          this.advance();
          const inner = this.parseExpression();
          if (this.peek()?.type === 'rparen') this.advance();
          return `\\sqrt{${inner}}`;
        }
        return '\\sqrt{}';
      }

      if (funcName === 'abs') {
        if (this.peek()?.type === 'lparen') {
          this.advance();
          const inner = this.parseExpression();
          if (this.peek()?.type === 'rparen') this.advance();
          return `\\left|${inner}\\right|`;
        }
        return '\\left|\\right|';
      }

      if (this.peek()?.type === 'lparen') {
        this.advance();
        const inner = this.parseExpression();
        if (this.peek()?.type === 'rparen') this.advance();

        if (funcName === 'diff' || funcName === 'derivative') {
          return `${latexName}\\left(${inner}\\right)`;
        }
        if (funcName === 'integrate' || funcName === 'int') {
          return `${latexName} ${inner} \\, dx`;
        }

        return `${latexName}\\left(${inner}\\right)`;
      }

      return latexName;
    }

    if (token.type === 'lparen') {
      this.advance();
      const inner = this.parseExpression();
      if (this.peek()?.type === 'rparen') this.advance();

      if (this.peek()?.type === 'caret') {
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
  try {
    const tokens = tokenize(input);
    if (tokens.length === 0) return '';
    const parser = new Parser(tokens);
    return parser.parse();
  } catch {
    return input.replace(/\^/g, '^');
  }
}
