import { parseProductConfig } from '@garun/config';
import { Card } from '@garun/ui/card';
import { StatusBadge } from '@garun/ui/status-badge';

export default function HomePage() {
  const product = parseProductConfig();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-5 py-12 sm:px-8">
      <Card aria-labelledby="foundation-title" className="w-full">
        <StatusBadge>Инженерная основа запущена</StatusBadge>
        <h1
          id="foundation-title"
          className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl"
        >
          {product.APP_NAME}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          Подготовлены web-приложение, worker, локальные сервисы, миграции и проверки качества.
          Продуктовые функции появятся в следующих milestones.
        </p>
        <dl className="mt-8 grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-slate-500">Окружение</dt>
            <dd className="mt-1 font-medium">{product.APP_ENV}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500">Техническое состояние</dt>
            <dd className="mt-1 font-medium">Готово к проверке health endpoints</dd>
          </div>
        </dl>
      </Card>
    </main>
  );
}
