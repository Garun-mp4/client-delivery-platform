'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface AppShellProps {
  readonly children: ReactNode;
  readonly userName: string;
  readonly userEmail: string;
  readonly workspaceName: string;
  readonly workspaceSlug: string;
  readonly owner: boolean;
}

function NavLink({
  href,
  label,
  exact = false,
}: {
  readonly href: string;
  readonly label: string;
  readonly exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link aria-current={active ? 'page' : undefined} className="app-nav-link" href={href}>
      <span aria-hidden="true" className="app-nav-marker" />
      {label}
    </Link>
  );
}

export function AppShell({
  children,
  userName,
  userEmail,
  workspaceName,
  workspaceSlug,
  owner,
}: AppShellProps) {
  const root = `/workspace/${workspaceSlug}`;
  return (
    <div className="app-shell">
      <header className="app-mobile-header">
        <Link className="app-wordmark" href={root}>
          Garun
        </Link>
        <span>{workspaceName}</span>
        <form action="/api/logout" method="post">
          <button className="button-link" type="submit">
            Выйти
          </button>
        </form>
      </header>
      <aside className="app-sidebar">
        <div>
          <Link className="app-wordmark" href={root}>
            Garun Workspace
          </Link>
          <p className="app-workspace-name">{workspaceName}</p>
        </div>
        <nav className="app-nav" aria-label="Основные разделы">
          <NavLink exact href={root} label={owner ? 'Обзор' : 'Главная'} />
          <NavLink href={`${root}/projects`} label="Проекты" />
          {owner ? <NavLink href={`${root}/clients`} label="Клиенты" /> : null}
          <NavLink href={`${root}/access`} label={owner ? 'Доступ' : 'Сеансы'} />
        </nav>
        <div className="app-user">
          <div className="app-user-copy">
            <strong>{userName}</strong>
            <span>{userEmail}</span>
          </div>
          <form action="/api/logout" method="post">
            <button className="button-link" type="submit">
              Выйти
            </button>
          </form>
        </div>
      </aside>
      <div className="app-stage" id="main-content" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
