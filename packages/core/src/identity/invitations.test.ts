import { describe, expect, it } from 'vitest';

import { canTransitionInvitation, publicInvitationState } from './invitations';

describe('invitation state transitions', () => {
  it('allows pending invitations to be accepted, revoked or resent', () => {
    expect(canTransitionInvitation('pending', 'accept', false)).toBe(true);
    expect(canTransitionInvitation('pending', 'revoke', false)).toBe(true);
    expect(canTransitionInvitation('pending', 'resend', false)).toBe(true);
  });

  it('denies terminal and expired transitions', () => {
    expect(canTransitionInvitation('accepted', 'accept', false)).toBe(false);
    expect(canTransitionInvitation('pending', 'accept', true)).toBe(false);
    expect(publicInvitationState('pending', true)).toBe('expired');
  });
});
