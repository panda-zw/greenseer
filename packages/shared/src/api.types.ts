export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface HealthResponse {
  status: 'ok';
  uptime: number;
}

export interface KeysPayload {
  anthropicKey?: string;
  adzunaAppId?: string;
  adzunaKey?: string;
}
