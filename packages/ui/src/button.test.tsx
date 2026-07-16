import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('is keyboard-accessible and uses a safe default type', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Проверить</Button>);

    const button = screen.getByRole('button', { name: 'Проверить' });
    expect(button).toHaveAttribute('type', 'button');

    button.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });
});
