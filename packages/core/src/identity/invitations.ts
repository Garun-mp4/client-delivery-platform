export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';
export type InvitationAction = 'accept' | 'revoke' | 'resend';

export function canTransitionInvitation(
  state: InvitationState,
  action: InvitationAction,
  expired: boolean,
): boolean {
  return !expired && state === 'pending' && ['accept', 'revoke', 'resend'].includes(action);
}

export function publicInvitationState(state: InvitationState, expired: boolean): InvitationState {
  return state === 'pending' && expired ? 'expired' : state;
}
