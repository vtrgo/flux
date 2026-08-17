export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export async function fetchApi<T = any>(endpoint: string, options: RequestInit & { params?: Record<string, string> } = {}): Promise<T> {
  let url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  if (options.params) {
    const searchParams = new URLSearchParams(options.params);
    url += `?${searchParams.toString()}`;
  }
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch (e) {
      // Ignore JSON parse error if response is not JSON
    }
    throw new Error(errorMessage);
  }
  
  // Return null or undefined for 204 No Content
  if (response.status === 204) {
    return null as any;
  }
  
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return text as any;
  }
}
