import { useEffect, useState } from 'preact/hooks';

interface JsonPayloadState<T> {
  data: T | null;
  error: boolean;
}

export function useJsonPayload<T>(url: string): JsonPayloadState<T> {
  const [state, setState] = useState<JsonPayloadState<T>>({
    data: null,
    error: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState({
      data: null,
      error: false,
    });

    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${url}`);
        }
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (!active) return;
        setState({
          data,
          error: false,
        });
      })
      .catch((error) => {
        if (!active || error?.name === 'AbortError') return;
        setState({
          data: null,
          error: true,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [url]);

  return state;
}
