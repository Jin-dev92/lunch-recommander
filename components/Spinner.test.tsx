import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Spinner from './Spinner';

describe('공통 스피너', () => {
  it('장식 요소로 렌더링되어 접근성 트리에서 숨겨집니다', () => {
    render(<Spinner />);
    expect(screen.getByTestId('spinner')).toHaveAttribute('aria-hidden', 'true');
  });
});
