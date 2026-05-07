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
  errorPosition: number | null;
}

export async function dispatch(input: string, signal?: AbortSignal): Promise<ComputeOutput> {
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
      errorPosition: null,
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
        errorPosition: null,
      };
    }
  }
  
  try {
    const cloud: CloudResponse = await computeCloud(input, signal);
  
    if (cloud.error) {
      // 云端报错时，如果本地能算出数值则降级使用
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
            errorPosition: null,
          };
        }
      }
      return {
        source: 'error',
        latex: '',
        plainText: '',
        numericValue: null,
        isSymbolic: false,
        variables: [],
        executionTime: cloud.execution_time,
        error: `${cloud.error.type}: ${cloud.error.message}`,
        errorPosition: cloud.error.position,
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
      errorPosition: null,
    };
  } catch (e) {
    if (signal?.aborted) {
      return {
        source: 'error',
        latex: '',
        plainText: '',
        numericValue: null,
        isSymbolic: false,
        variables: [],
        executionTime: '0ms',
        error: '请求已取消',
        errorPosition: null,
      };
    }

    // 网络异常时的降级处理
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
        errorPosition: null,
      };
    }

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
        errorPosition: null,
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
      errorPosition: null,
    };
  }
}
