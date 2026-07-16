import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { workspace, workspaceMembership } from '@garun/db/schema';

import { currentSession, database } from '@/lib/server';

export default async function WorkspaceIndexPage() {
  const identity = await currentSession();
  if (!identity) redirect('/login');
  const [first] = await database.db
    .select({ slug: workspace.slug })
    .from(workspaceMembership)
    .innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
    .where(
      and(
        eq(workspaceMembership.userId, identity.user.id),
        eq(workspaceMembership.status, 'active'),
        eq(workspace.status, 'active'),
      ),
    )
    .limit(1);
  if (!first) redirect('/access-denied');
  redirect(`/workspace/${first.slug}`);
}
