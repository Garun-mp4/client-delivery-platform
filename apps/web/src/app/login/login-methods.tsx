'use client';

import { useState } from 'react';

import { SubmitButton } from '../_components/submit-button';

export function LoginMethods({ callback }: { readonly callback: string }) {
  const [method, setMethod] = useState<'password' | 'link'>('password');
  return (
    <div className="login-methods">
      <div className="login-tabs" role="tablist" aria-label="Способ входа">
        <button
          aria-controls="password-panel"
          aria-selected={method === 'password'}
          className="login-tab"
          onClick={() => setMethod('password')}
          role="tab"
          type="button"
        >
          По паролю
        </button>
        <button
          aria-controls="link-panel"
          aria-selected={method === 'link'}
          className="login-tab"
          onClick={() => setMethod('link')}
          role="tab"
          type="button"
        >
          Ссылка на почту
        </button>
      </div>
      {method === 'password' ? (
        <div id="password-panel" role="tabpanel">
          <p className="method-explanation">Для владельца и тех, кто уже установил пароль.</p>
          <form className="stack" action="/api/login/password" method="post">
            <input name="callback" type="hidden" value={callback} />
            <label htmlFor="owner-email">Email</label>
            <input id="owner-email" name="email" type="email" autoComplete="username" required />
            <label htmlFor="owner-password">Пароль</label>
            <input
              id="owner-password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={12}
              required
            />
            <SubmitButton pendingText="Входим…">Войти</SubmitButton>
          </form>
        </div>
      ) : (
        <div id="link-panel" role="tabpanel">
          <p className="method-explanation">
            Мы отправим одноразовую ссылку, если этот адрес уже приглашён.
          </p>
          <form className="stack" action="/api/auth/request-link" method="post">
            <input name="callback" type="hidden" value={callback} />
            <label htmlFor="magic-email">Email</label>
            <input id="magic-email" name="email" type="email" autoComplete="email" required />
            <SubmitButton pendingText="Готовим письмо…">Получить ссылку</SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
