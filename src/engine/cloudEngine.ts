const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export interface CloudRequest {
  payload: {
    expression: string;
    engine_hint: 'auto' | 'symbolic' | 'numeric';
    output_config: {
      format: 'latex' | 'mathml' | 'plain';
      precision: number;
      simplify: boolean;
    };
  };
}

export interface CloudResult {
  is_symbolic: boolean;
  main_display: string;
  plain_text: string;
  numeric_approximation: string | null;
  variables: string[];
}

export interface CloudError {
  type: string;
  message: string;
  position: number | null;
}

export interface CloudResponse {
  status_code: number;
  execution_time: string;
  result: CloudResult | null;
  error: CloudError | null;
}

export async function computeCloud(expression: string, signal?: AbortSignal): Promise<CloudResponse> {
  const body: CloudRequest = {
    payload: {
      expression,
      engine_hint: 'auto',
      output_config: {
        format: 'latex',
        precision: 15,
        simplify: true,
      },
    },
  };

  const res = await fetch(`${API_BASE}/v1/compute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  return res.json();
}
