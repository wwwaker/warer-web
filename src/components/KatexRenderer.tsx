import { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface Props {
  latex: string;
  displayMode?: boolean;
}

export default function KatexRenderer({ latex, displayMode = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !latex) return;
    try {
      katex.render(latex, ref.current, {
        displayMode,
        throwOnError: false,
        trust: true,
      });
    } catch {
      if (ref.current) {
        ref.current.textContent = latex;
      }
    }
  }, [latex, displayMode]);

  return <div ref={ref} className="katex-output" />;
}
