import { useEffect, useRef, useState } from "react";
import { api, ApiError, endpoints } from "@/api/client";

export interface LocationResult {
  id: string;
  label: string;
  secondary: string | null;
  lat: number;
  lng: number;
}

export function useLocationSearch(query: string) {
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      seqRef.current += 1;
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const mySeq = ++seqRef.current;
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      try {
        const rows = await api.get<LocationResult[]>(endpoints.locations.search(trimmed));
        if (seqRef.current !== mySeq) return;
        setResults(rows);
        setLoading(false);
      } catch (err) {
        if (seqRef.current !== mySeq) return;
        setError(err instanceof ApiError ? err.message : "Couldn't search locations. Try again.");
        setLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query]);

  return { results, loading, error };
}