import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { isOwner } from '@garun/core/identity';
import { workspace } from '@garun/db/schema';

import { AppShell } from './_components/app-shell';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { identity, tenant } = await requireTenantPage(slug);
  const [space] = await database.db
    .select({ name: workspace.name })
    .from(workspace)
    .where(eq(workspace.id, tenant.workspaceId))
    .limit(1);
  if (!space) notFound();
  return (
    <AppShell
      owner={isOwner(tenant)}
      userEmail={identity.user.email}
      userName={identity.user.name}
      workspaceName={space.name}
      workspaceSlug={slug}
    >
      {children}
    </AppShell>
  );
}
