import { needsCloud, computeLocal } from './localEngine';
import { computeCloud, type CloudResponse } from './cloudEngine';

export type ComputeSource = 'local' | 'cloud' | 'error';

export interface ComputeOutput {
  source: ComputeSource;
  latex: string;
  plainText: string;
  numericValue: number | null;
  isSymbolic: boolean;
  variables: string[];
  executionTime: string;
  error: string | null;
}

export async function dispatch(input: string): Promise<ComputeOutput> {
  if (!input.trim()) {
    return {
      source: 'error',
      latex: '',
      plainText: '',
      numericValue: null,
      isSymbolic: false,
      variables: [],
      executionTime: '0ms',
      error: '表达式不能为空',
    };
  }

  if (!needsCloud(input)) {
    const local = computeLocal(input);
    if (local) {
      return {
        source: 'local',
        latex: String(local.numeric_value),
        plainText: local.plain_text,
        numericValue: local.numeric_value,
        isSymbolic: false,
        variables: [],
        executionTime: '<1ms',
        error: null,
      };
    }
  }

  try {
    const cloud: CloudResponse = await computeCloud(input);

    if (cloud.error) {
      return {
        source: 'error',
        latex: '',
        plainText: '',
        numericValue: null,
        isSymbolic: false,
        variables: [],
        executionTime: cloud.execution_time,
        error: `${cloud.error.type}: ${cloud.error.message}`,
      };
    }

    const r = cloud.result!;
    return {
      source: 'cloud',
      latex: r.main_display,
      plainText: r.plain_text,
      numericValue: r.numeric_approximation ? parseFloat(r.numeric_approximation) : null,
      isSymbolic: r.is_symbolic,
      variables: r.variables,
      executionTime: cloud.execution_time,
      error: null,
    };
  } catch (e) {
    if (!needsCloud(input)) {
      return {
        source: 'error',
        latex: '',
        plainText: '',
        numericValue: null,
        isSymbolic: false,
        variables: [],
        executionTime: '0ms',
        error: '本地计算失败，且云端服务不可用',
      };
    }
    return {
      source: 'error',
      latex: '',
      plainText: '',
      numericValue: null,
      isSymbolic: false,
      variables: [],
      executionTime: '0ms',
      error: `网络错误: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
