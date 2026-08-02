'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const maxAutomaticRefreshes = 5;
const refreshIntervalMs = 2_500;

export function VersionStatusRefresh({ active }: { readonly active: boolean }) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const [manualRefresh, setManualRefresh] = useState(false);

  useEffect(() => {
    if (!active || attempts >= maxAutomaticRefreshes) return;
    const timer = window.setTimeout(() => {
      setAttempts((current) => current + 1);
      router.refresh();
    }, refreshIntervalMs);
    return () => window.clearTimeout(timer);
  }, [active, attempts, router]);

  function refresh() {
    setManualRefresh(true);
    router.refresh();
    window.setTimeout(() => setManualRefresh(false), 700);
  }

  return (
    <div className="version-refresh" aria-live="polite">
      <span>
        {active && attempts < maxAutomaticRefreshes
          ? 'Статус обновится автоматически.'
          : active
            ? 'Автообновление остановлено, чтобы не создавать лишние запросы.'
            : 'Статус актуален на момент открытия страницы.'}
      </span>
      <button className="button-link" type="button" onClick={refresh} disabled={manualRefresh}>
        {manualRefresh ? 'Обновляем…' : 'Обновить статус'}
      </button>
    </div>
  );
}
