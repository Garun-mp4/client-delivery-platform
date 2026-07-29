'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sections = [
  { label: 'Обзор', suffix: '' },
  { label: 'План', suffix: '/workflow' },
  { label: 'Анкеты', suffix: '/questionnaires' },
  { label: 'Материалы', suffix: '/materials' },
] as const;

export function ProjectNav({
  workspaceSlug,
  projectSlug,
}: {
  readonly workspaceSlug: string;
  readonly projectSlug: string;
}) {
  const pathname = usePathname();
  const root = `/workspace/${workspaceSlug}/projects/${projectSlug}`;
  return (
    <nav className="project-nav" aria-label="Разделы проекта">
      {sections.map((section) => {
        const href = `${root}${section.suffix}`;
        const active = section.suffix === '' ? pathname === root : pathname.startsWith(href);
        return (
          <Link aria-current={active ? 'page' : undefined} href={href} key={section.suffix}>
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
