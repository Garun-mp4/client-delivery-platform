import Link from 'next/link';
import { notFound } from 'next/navigation';

import { decryptOutboxSecret } from '@garun/auth/crypto';
import { getSiteVersionAccessSecret } from '@garun/core/review';

import { requireTenantPage } from '@/lib/page-tenant';
import { database, environment } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function VersionAccessPage({
  params,
}: {
  params: Promise<{ slug: string; projectSlug: string; versionId: string }>;
}) {
  const { slug, projectSlug, versionId } = await params;
  const { tenant } = await requireTenantPage(slug);
  const version = await getSiteVersionAccessSecret(database, tenant, projectSlug, versionId).catch(
    () => null,
  );
  if (!version) notFound();
  const encryptedPassword = version.accessSecretEncrypted;
  if (!encryptedPassword) notFound();
  const password = decryptOutboxSecret(encryptedPassword, environment.OUTBOX_ENCRYPTION_KEY);
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="preview-access-title">
        <p className="eyebrow">Защищённая версия</p>
        <h1 id="preview-access-title">Доступ к «{version.name}»</h1>
        <p className="muted">
          Пароль показан только участникам этого проекта. Не пересылайте его посторонним.
        </p>
        <dl className="secret-card">
          <dt>Пароль preview</dt>
          <dd>{password}</dd>
        </dl>
        <Link href={`/workspace/${slug}/projects/${projectSlug}/review`}>Вернуться к версии</Link>
      </section>
    </main>
  );
}
