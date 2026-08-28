import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';

export const useSupabaseQuery = (queryFn, deps = []) => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const execute = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: result, error: err } = await queryFn(supabase);
      if (err) throw err;
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => { execute(); }, [execute]);
  return { data, loading, error, refetch: execute };
};