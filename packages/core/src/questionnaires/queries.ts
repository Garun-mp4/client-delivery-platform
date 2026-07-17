import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  projectMembership,
  questionnaire,
  questionnaireAnswerComment,
  questionnaireDraft,
  questionnaireSubmission,
  user,
  workspaceMembership,
} from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import { parseQuestionnaireSchema, validateQuestionnaireAnswers } from './validation';

export async function listQuestionnaires(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await resolveProjectAccess(database, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view')) return null;
  const rows = await database
    .select({
      id: questionnaire.id,
      title: questionnaire.title,
      description: questionnaire.description,
      status: questionnaire.status,
      assignedToUserId: questionnaire.assignedToUserId,
      assigneeName: user.name,
      dueAt: questionnaire.dueAt,
      submittedAt: questionnaire.submittedAt,
      completedAt: questionnaire.completedAt,
      updatedAt: questionnaire.updatedAt,
    })
    .from(questionnaire)
    .innerJoin(user, eq(user.id, questionnaire.assignedToUserId))
    .where(
      and(
        eq(questionnaire.workspaceId, tenant.workspaceId),
        eq(questionnaire.projectId, access!.projectId),
        access!.side === 'client' ? eq(questionnaire.assignedToUserId, tenant.userId) : undefined,
      ),
    )
    .orderBy(desc(questionnaire.updatedAt));
  return { access: access!, rows };
}

export async function getQuestionnaire(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  projectSlug: string,
  questionnaireId: string,
) {
  const access = await resolveProjectAccess(database, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view')) return null;
  const [item] = await database
    .select({
      id: questionnaire.id,
      projectId: questionnaire.projectId,
      title: questionnaire.title,
      description: questionnaire.description,
      status: questionnaire.status,
      assignedToUserId: questionnaire.assignedToUserId,
      assigneeName: user.name,
      schemaSnapshot: questionnaire.schemaSnapshot,
      dueAt: questionnaire.dueAt,
      submittedAt: questionnaire.submittedAt,
      completedAt: questionnaire.completedAt,
      updatedAt: questionnaire.updatedAt,
    })
    .from(questionnaire)
    .innerJoin(user, eq(user.id, questionnaire.assignedToUserId))
    .where(
      and(
        eq(questionnaire.id, questionnaireId),
        eq(questionnaire.workspaceId, tenant.workspaceId),
        eq(questionnaire.projectId, access!.projectId),
        access!.side === 'client' ? eq(questionnaire.assignedToUserId, tenant.userId) : undefined,
      ),
    )
    .limit(1);
  if (!item) return null;
  const schema = parseQuestionnaireSchema(item.schemaSnapshot, { allowFileFields: true });
  const [draftRows, submissions, comments] = await Promise.all([
    access!.side === 'client' && item.assignedToUserId === tenant.userId
      ? database
          .select({
            answers: questionnaireDraft.answers,
            version: questionnaireDraft.version,
            lastSavedAt: questionnaireDraft.lastSavedAt,
          })
          .from(questionnaireDraft)
          .where(
            and(
              eq(questionnaireDraft.questionnaireId, item.id),
              eq(questionnaireDraft.workspaceId, tenant.workspaceId),
              eq(questionnaireDraft.userId, tenant.userId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    database
      .select({
        id: questionnaireSubmission.id,
        revision: questionnaireSubmission.revision,
        answers: questionnaireSubmission.answers,
        status: questionnaireSubmission.status,
        submittedByUserId: questionnaireSubmission.submittedByUserId,
        submittedAt: questionnaireSubmission.submittedAt,
        reviewedByUserId: questionnaireSubmission.reviewedByUserId,
        reviewedAt: questionnaireSubmission.reviewedAt,
        reviewComment: questionnaireSubmission.reviewComment,
      })
      .from(questionnaireSubmission)
      .where(
        and(
          eq(questionnaireSubmission.questionnaireId, item.id),
          eq(questionnaireSubmission.workspaceId, tenant.workspaceId),
        ),
      )
      .orderBy(desc(questionnaireSubmission.revision)),
    database
      .select({
        id: questionnaireAnswerComment.id,
        submissionId: questionnaireAnswerComment.submissionId,
        fieldId: questionnaireAnswerComment.fieldId,
        body: questionnaireAnswerComment.body,
        createdByUserId: questionnaireAnswerComment.createdByUserId,
        authorName: user.name,
        createdAt: questionnaireAnswerComment.createdAt,
      })
      .from(questionnaireAnswerComment)
      .innerJoin(user, eq(user.id, questionnaireAnswerComment.createdByUserId))
      .where(
        and(
          eq(questionnaireAnswerComment.questionnaireId, item.id),
          eq(questionnaireAnswerComment.workspaceId, tenant.workspaceId),
        ),
      )
      .orderBy(asc(questionnaireAnswerComment.createdAt)),
  ]);
  const draft = draftRows[0];
  return {
    access: access!,
    questionnaire: { ...item, schemaSnapshot: schema },
    draft: draft
      ? {
          ...draft,
          progress: validateQuestionnaireAnswers(schema, draft.answers),
        }
      : null,
    submissions,
    comments,
  };
}

export async function listQuestionnaireAssignees(
  database: DatabaseClient['db'],
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await resolveProjectAccess(database, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view.internal')) return [];
  return database
    .select({ userId: projectMembership.userId, name: user.name })
    .from(projectMembership)
    .innerJoin(user, eq(user.id, projectMembership.userId))
    .innerJoin(
      workspaceMembership,
      and(
        eq(workspaceMembership.workspaceId, projectMembership.workspaceId),
        eq(workspaceMembership.userId, projectMembership.userId),
        eq(workspaceMembership.status, 'active'),
      ),
    )
    .where(
      and(
        eq(projectMembership.workspaceId, tenant.workspaceId),
        eq(projectMembership.projectId, access!.projectId),
        eq(projectMembership.side, 'client'),
        eq(projectMembership.role, 'client'),
        isNull(projectMembership.removedAt),
      ),
    )
    .orderBy(asc(user.name));
}
