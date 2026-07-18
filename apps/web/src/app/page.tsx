import { connection } from 'next/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { parseProductConfig } from '@garun/config';

import { currentSession } from '@/lib/server';

export default async function HomePage() {
  await connection();
  const product = parseProductConfig();
  if (await currentSession()) redirect('/workspace');

  return (
    <main className="entry-shell" id="main-content">
      <div className="entry-wordmark">{product.APP_NAME}</div>
      <section className="entry-main" aria-labelledby="entry-title">
        <div className="entry-copy">
          <p className="eyebrow">Работа с клиентом без потерянного контекста</p>
          <h1 id="entry-title">Откройте проект и сразу увидьте следующий шаг</h1>
          <p className="lede">
            Материалы, анкеты, этапы и решения собраны в одном понятном маршруте — отдельно для
            разработчика и клиента.
          </p>
          <Link className="button-primary entry-action" href="/login">
            Войти в рабочее пространство
          </Link>
          <p className="entry-note">Доступ предоставляется только по приглашению.</p>
        </div>
        <div className="entry-route" aria-label="Пример маршрута проекта">
          <p className="section-label">Маршрут проекта</p>
          <ol>
            <li className="is-complete">
              <span>01</span>
              <div>
                <strong>Бриф заполнен</strong>
                <small>Информация сохранена</small>
              </div>
            </li>
            <li className="is-current">
              <span>02</span>
              <div>
                <strong>Нужен логотип</strong>
                <small>Действие клиента</small>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Первый макет</strong>
                <small>Следующий результат</small>
              </div>
            </li>
          </ol>
        </div>
      </section>
      <footer className="entry-footer">
        <span>Garun Workspace</span>
        <span>Приватное пространство клиентского проекта</span>
      </footer>
    </main>
  );
}
