import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TenantContext } from '@garun/core/identity';
import {
  addFeedbackComment,
  createFeedback,
  createProjectUpdate,
  createSiteVersion,
  getProjectReview,
  publishSiteVersion,
  transitionFeedback,
} from '@garun/core/review';
import { createDatabaseClient } from '@garun/db';
import {
  clientCompany,
  clientMembership,
  project,
  projectMembership,
  siteVersion,
  user,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
const database = createDatabaseClient(databaseUrl);
const suffix = crypto.randomUUID().slice(0, 8);
let workspaceId = '';
let otherWorkspaceId = '';
let projectId = '';
let ownerId = '';
let clientId = '';
let ownerTenant: TenantContext;
let clientTenant: TenantContext;

beforeAll(async () => {
  const identities = await database.db
    .insert(user)
    .values([
      { name: 'Review owner', email: `review-owner-${suffix}@example.test`, emailVerified: true },
      { name: 'Review client', email: `review-client-${suffix}@example.test`, emailVerified: true },
      { name: 'Other owner', email: `review-other-${suffix}@example.test`, emailVerified: true },
    ])
    .returning({ id: user.id });
  ownerId = identities[0]!.id;
  clientId = identities[1]!.id;
  const spaces = await database.db
    .insert(workspace)
    .values([
      { name: 'Review workspace', slug: `review-${suffix}`, ownerId },
      { name: 'Other workspace', slug: `review-other-${suffix}`, ownerId: identities[2]!.id },
    ])
    .returning({ id: workspace.id });
  workspaceId = spaces[0]!.id;
  otherWorkspaceId = spaces[1]!.id;
  await database.db.insert(workspaceMembership).values([
    { workspaceId, userId: ownerId, role: 'owner' },
    { workspaceId, userId: clientId, role: 'member' },
    { workspaceId: otherWorkspaceId, userId: identities[2]!.id, role: 'owner' },
  ]);
  const [company] = await database.db
    .insert(clientCompany)
    .values({ workspaceId, name: 'Review client' })
    .returning({ id: clientCompany.id });
  await database.db.insert(clientMembership).values({
    workspaceId,
    clientCompanyId: company!.id,
    userId: clientId,
    role: 'primary',
  });
  const [createdProject] = await database.db
    .insert(project)
    .values({
      workspaceId,
      clientCompanyId: company!.id,
      name: 'Review project',
      slug: `review-project-${suffix}`,
      description: 'Review flow',
      projectType: 'website',
      status: 'in_progress',
      ownerUserId: ownerId,
      plannedStartDate: '2026-07-01',
      plannedEndDate: '2026-12-01',
      publishedAt: new Date(),
    })
    .returning({ id: project.id });
  projectId = createdProject!.id;
  await database.db.insert(projectMembership).values([
    {
      workspaceId,
      projectId,
      userId: ownerId,
      side: 'internal',
      role: 'owner',
    },
    {
      workspaceId,
      projectId,
      userId: clientId,
      side: 'client',
      role: 'client',
    },
  ]);
  ownerTenant = {
    workspaceId,
    workspaceSlug: `review-${suffix}`,
    userId: ownerId,
    workspaceStatus: 'active',
    role: 'owner',
    membershipStatus: 'active',
    explicitGrants: [],
  };
  clientTenant = {
    workspaceId,
    workspaceSlug: `review-${suffix}`,
    userId: clientId,
    workspaceStatus: 'active',
    role: 'member',
    membershipStatus: 'active',
    explicitGrants: [],
  };
});

afterAll(async () => {
  await database.db.delete(workspace).where(inArray(workspace.id, [workspaceId, otherWorkspaceId]));
  await database.pool.end();
});

describe('Milestone 07 review loop', () => {
  it('keeps pending versions private and preserves old published versions', async () => {
    const projectSlug = `review-project-${suffix}`;
    await createProjectUpdate(database, ownerTenant, projectSlug, {
      title: 'Внутреннее',
      body: 'Не показывать клиенту',
      visibility: 'internal',
      importance: 'normal',
      pinned: false,
    });
    await createProjectUpdate(database, ownerTenant, projectSlug, {
      title: 'Готова первая версия',
      body: 'Проверьте главную страницу',
      visibility: 'client',
      importance: 'important',
      pinned: true,
    });
    const first = await createSiteVersion(database, ownerTenant, projectSlug, {
      name: 'Первая версия',
      description: null,
      changeLog: 'Собрана главная',
      checkInstructions: 'Проверить текст',
      url: 'https://example.com/',
      environmentType: 'preview',
      accessMode: 'public',
      accessSecretEncrypted: null,
    });
    expect((await getProjectReview(database, clientTenant, projectSlug)).versions).toHaveLength(0);
    await database.db
      .update(siteVersion)
      .set({
        securityStatus: 'safe',
        availabilityStatus: 'reachable',
        embedStatus: 'blocked',
        checkedAt: new Date(),
      })
      .where(eq(siteVersion.id, first.id));
    await publishSiteVersion(database, ownerTenant, projectSlug, first.id, false);
    await publishSiteVersion(database, ownerTenant, projectSlug, first.id, false);
    await database.db
      .update(siteVersion)
      .set({ checkedAt: new Date(Date.now() - 11 * 60 * 1_000) })
      .where(eq(siteVersion.id, first.id));
    await publishSiteVersion(database, ownerTenant, projectSlug, first.id, false);
    const second = await createSiteVersion(database, ownerTenant, projectSlug, {
      name: 'Вторая версия',
      description: null,
      changeLog: 'Новый экран',
      checkInstructions: 'Проверить мобильную версию',
      url: 'https://example.org/',
      environmentType: 'preview',
      accessMode: 'public',
      accessSecretEncrypted: null,
    });
    await database.db
      .update(siteVersion)
      .set({
        securityStatus: 'safe',
        availabilityStatus: 'reachable',
        checkedAt: new Date(Date.now() - 11 * 60 * 1_000),
        checkAttempts: 5,
      })
      .where(eq(siteVersion.id, second.id));
    await expect(
      publishSiteVersion(database, ownerTenant, projectSlug, second.id, false),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const [requeued] = await database.db
      .select({
        securityStatus: siteVersion.securityStatus,
        checkAttempts: siteVersion.checkAttempts,
      })
      .from(siteVersion)
      .where(eq(siteVersion.id, second.id));
    expect(requeued).toEqual({ securityStatus: 'pending', checkAttempts: 0 });
    const clientReview = await getProjectReview(database, clientTenant, projectSlug);
    expect(clientReview.updates.map((item) => item.title)).toEqual(['Готова первая версия']);
    expect(clientReview.versions.map((item) => item.id)).toEqual([first.id]);
    expect(clientReview.versions.map((item) => item.id)).not.toContain(second.id);
  });

  it('separates comments from workflow and hides internal replies', async () => {
    const projectSlug = `review-project-${suffix}`;
    const [version] = await database.db
      .select({ id: siteVersion.id })
      .from(siteVersion)
      .where(and(eq(siteVersion.projectId, projectId), eq(siteVersion.clientVisible, true)));
    const feedback = await createFeedback(database, clientTenant, projectSlug, {
      siteVersionId: version!.id,
      title: 'Исправить заголовок',
      body: 'На телефоне переносится неудачно',
      priority: 'high',
      pageUrl: null,
      screenshotFileId: null,
    });
    await addFeedbackComment(
      database,
      ownerTenant,
      projectSlug,
      feedback.id,
      'Внутренняя оценка',
      'internal',
    );
    expect(
      (await getProjectReview(database, clientTenant, projectSlug)).feedback[0]!.comments,
    ).toHaveLength(0);
    await transitionFeedback(
      database,
      ownerTenant,
      projectSlug,
      feedback.id,
      'accepted',
      'in_scope',
    );
    await transitionFeedback(
      database,
      ownerTenant,
      projectSlug,
      feedback.id,
      'in_progress',
      'in_scope',
    );
    await transitionFeedback(database, ownerTenant, projectSlug, feedback.id, 'fixed', 'in_scope');
    await transitionFeedback(
      database,
      ownerTenant,
      projectSlug,
      feedback.id,
      'awaiting_verification',
      'in_scope',
    );
    await transitionFeedback(
      database,
      clientTenant,
      projectSlug,
      feedback.id,
      'closed',
      'in_scope',
    );
    expect((await getProjectReview(database, clientTenant, projectSlug)).feedback[0]!.status).toBe(
      'closed',
    );
  });

  it('denies a foreign tenant without confirming the project', async () => {
    const foreignTenant: TenantContext = {
      workspaceId: otherWorkspaceId,
      workspaceSlug: `review-other-${suffix}`,
      userId: ownerId,
      workspaceStatus: 'active',
      role: 'owner',
      membershipStatus: 'active',
      explicitGrants: [],
    };
    await expect(
      getProjectReview(database, foreignTenant, `review-project-${suffix}`),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
