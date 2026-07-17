import Link from 'next/link';

export function WorkspaceNav({ slug, internal }: { slug: string; internal: boolean }) {
  return (
    <nav className="workspace-nav" aria-label="Разделы рабочего пространства">
      <Link href={`/workspace/${slug}/projects`}>Проекты</Link>
      {internal ? <Link href={`/workspace/${slug}/clients`}>Клиенты</Link> : null}
      {internal ? <Link href={`/workspace/${slug}`}>Настройки доступа</Link> : null}
    </nav>
  );
}
