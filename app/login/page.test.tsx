import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captchaReset = vi.fn();

vi.mock('../../components/AuthTurnstile', () => ({
  default: forwardRef<{ reset(): void }, { onTokenChange(token: string): void }>(
    function AuthTurnstileDouble({ onTokenChange }, ref) {
      useImperativeHandle(ref, () => ({ reset: captchaReset }));
      return <button onClick={() => onTokenChange('captcha-token')}>CAPTCHA 확인</button>;
    },
  ),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
    },
  },
  signupSupabase: {
    auth: {
      resend: vi.fn(),
      signUp: vi.fn(),
    },
  },
}));

import { signupSupabase, supabase } from '../../lib/supabaseClient';
import { renderWithQuery } from '../../tests/renderWithQuery';
import LoginPage from './page';

const getSession = supabase.auth.getSession as ReturnType<typeof vi.fn>;
const signInWithPassword = supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>;
const resend = signupSupabase.auth.resend as ReturnType<typeof vi.fn>;
const signUp = signupSupabase.auth.signUp as ReturnType<typeof vi.fn>;

function loginForm() {
  return screen.getByLabelText('이메일').closest('form')!;
}

function fillLogin() {
  fireEvent.change(screen.getByLabelText('이메일'), {
    target: { value: 'a@b.com' },
  });
  fireEvent.change(screen.getByLabelText('비밀번호'), {
    target: { value: 'password1' },
  });
}

function openSignup() {
  fireEvent.click(screen.getByRole('button', { name: '회원가입' }));
  return screen.getByRole('dialog');
}

function fillSignup(passwordConfirm = 'password1') {
  fireEvent.change(screen.getByLabelText('회원가입 이메일'), {
    target: { value: 'guest@example.com' },
  });
  fireEvent.change(screen.getByLabelText('회원가입 비밀번호'), {
    target: { value: 'password1' },
  });
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), {
    target: { value: passwordConfirm },
  });
}

describe('로그인', () => {
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSession.mockReset();
    signInWithPassword.mockReset();
    resend.mockReset();
    signUp.mockReset();
    captchaReset.mockReset();
    assign = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign },
    });
  });

  it('CAPTCHA 검증 전에는 로그인을 제출할 수 없습니다', () => {
    renderWithQuery(<LoginPage />);
    fillLogin();

    expect(screen.getByRole('button', { name: '로그인' })).toBeDisabled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('CAPTCHA 토큰으로 로그인하고 완료 후 위젯을 초기화합니다', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-id' }, session: { access_token: 'token' } },
      error: null,
    });
    renderWithQuery(<LoginPage />);
    fillLogin();
    fireEvent.click(within(loginForm()).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(loginForm());

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password1',
      options: { captchaToken: 'captcha-token' },
    });
    expect(captchaReset).toHaveBeenCalled();
  });

  it('로그인 실패 시 오류를 표시하고 위젯을 초기화합니다', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: '잘못된 비밀번호입니다' },
    });
    renderWithQuery(<LoginPage />);
    fillLogin();
    fireEvent.click(within(loginForm()).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(loginForm());

    expect(await screen.findByRole('alert')).toHaveTextContent('잘못된 비밀번호입니다');
    expect(assign).not.toHaveBeenCalled();
    expect(captchaReset).toHaveBeenCalled();
  });

  it('로그인 요청 중 공통 스피너를 보여줍니다', async () => {
    signInWithPassword.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<LoginPage />);
    fillLogin();
    fireEvent.click(within(loginForm()).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(loginForm());

    const button = await screen.findByRole('button', { name: '로그인 중…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(within(button).getByTestId('spinner')).toBeInTheDocument();
  });

  it('회원가입 폼은 모달을 열기 전에는 보이지 않습니다', () => {
    renderWithQuery(<LoginPage />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument();
  });
});

describe('회원가입 모달', () => {
  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({
      data: { session: { user: { is_anonymous: true } } },
      error: null,
    });
    signInWithPassword.mockReset();
    resend.mockReset();
    signUp.mockReset();
    captchaReset.mockReset();
  });

  it('이메일과 두 비밀번호 입력을 표시합니다', () => {
    renderWithQuery(<LoginPage />);
    const dialog = openSignup();

    expect(within(dialog).getByLabelText('회원가입 이메일')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('회원가입 비밀번호')).toHaveAttribute('minlength', '8');
    expect(within(dialog).getByLabelText('비밀번호 확인')).toBeInTheDocument();
  });

  it('비밀번호가 다르면 가입 요청을 보내지 않습니다', async () => {
    renderWithQuery(<LoginPage />);
    const dialog = openSignup();
    fillSignup('different1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(within(dialog).getByRole('button', { name: '가입하기' }).closest('form')!);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '비밀번호가 일치하지 않습니다.',
    );
    expect(signUp).not.toHaveBeenCalled();
  });

  it('CAPTCHA 토큰으로 가입하고 인증 메일 안내를 표시합니다', async () => {
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    renderWithQuery(<LoginPage />);
    const dialog = openSignup();
    fillSignup();
    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(within(dialog).getByRole('button', { name: '가입하기' }).closest('form')!);

    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      '인증 메일을 확인해 주세요.',
    );
    expect(signUp).toHaveBeenCalledWith({
      email: 'guest@example.com',
      password: 'password1',
      options: {
        captchaToken: 'captcha-token',
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    expect(within(dialog).queryByLabelText('회원가입 비밀번호')).not.toBeInTheDocument();
    expect(within(dialog).getByText('guest@example.com')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '인증 메일 재전송' })).toBeDisabled();
    expect(captchaReset).toHaveBeenCalled();
  });

  it('가입한 이메일로 CAPTCHA 토큰과 홈 redirect를 사용해 인증 메일을 재전송합니다', async () => {
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    resend.mockResolvedValue({ data: {}, error: null });
    renderWithQuery(<LoginPage />);
    const dialog = openSignup();
    fillSignup();
    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(within(dialog).getByRole('button', { name: '가입하기' }).closest('form')!);
    await within(dialog).findByText('guest@example.com');

    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '인증 메일 재전송' }));

    await waitFor(() =>
      expect(resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'guest@example.com',
        options: {
          captchaToken: 'captcha-token',
          emailRedirectTo: `${window.location.origin}/`,
        },
      }),
    );
  });

  it('재전송 요청 중 공통 스피너를 보여줍니다', async () => {
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    resend.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<LoginPage />);
    const dialog = openSignup();
    fillSignup();
    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(within(dialog).getByRole('button', { name: '가입하기' }).closest('form')!);
    await within(dialog).findByText('guest@example.com');

    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '인증 메일 재전송' }));

    const button = await within(dialog).findByRole('button', { name: '재전송 중…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(within(button).getByTestId('spinner')).toBeInTheDocument();
  });

  it('재전송 성공 후 60초 쿨다운을 표시하고 남은 시간을 줄입니다', async () => {
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    resend.mockResolvedValue({ data: {}, error: null });
    renderWithQuery(<LoginPage />);
    const dialog = openSignup();
    fillSignup();
    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(within(dialog).getByRole('button', { name: '가입하기' }).closest('form')!);
    await within(dialog).findByText('guest@example.com');

    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '인증 메일 재전송' }));

    expect(await within(dialog).findByText('인증 메일을 다시 보냈습니다.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '60초 후 재전송' })).toBeDisabled();
    await waitFor(
      () =>
        expect(within(dialog).getByRole('button', { name: '59초 후 재전송' })).toBeDisabled(),
      { timeout: 1_500 },
    );
  });

  it('재전송 실패를 표시하고 CAPTCHA를 초기화합니다', async () => {
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    resend.mockResolvedValue({
      data: {},
      error: { message: '재전송 실패' },
    });
    renderWithQuery(<LoginPage />);
    const dialog = openSignup();
    fillSignup();
    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(within(dialog).getByRole('button', { name: '가입하기' }).closest('form')!);
    await within(dialog).findByText('guest@example.com');
    const resetCountAfterSignup = captchaReset.mock.calls.length;

    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '인증 메일 재전송' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('재전송 실패');
    expect(captchaReset).toHaveBeenCalledTimes(resetCountAfterSignup + 1);
    expect(within(dialog).getByRole('button', { name: '인증 메일 재전송' })).toBeDisabled();
  });

  it('가입 오류를 표시하고 위젯을 초기화합니다', async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: '가입할 수 없습니다.' },
    });
    renderWithQuery(<LoginPage />);
    const dialog = openSignup();
    fillSignup();
    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(within(dialog).getByRole('button', { name: '가입하기' }).closest('form')!);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('가입할 수 없습니다.');
    expect(captchaReset).toHaveBeenCalled();
  });

  it('가입 요청 중 공통 스피너를 보여줍니다', async () => {
    signUp.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<LoginPage />);
    const dialog = openSignup();
    fillSignup();
    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(within(dialog).getByRole('button', { name: '가입하기' }).closest('form')!);

    const button = await within(dialog).findByRole('button', { name: '가입 중…' });
    expect(button).toBeDisabled();
    expect(within(button).getByTestId('spinner')).toBeInTheDocument();
  });

  it('닫았다가 다시 열면 이전 결과와 입력을 초기화합니다', async () => {
    signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    renderWithQuery(<LoginPage />);
    let dialog = openSignup();
    fillSignup();
    fireEvent.click(within(dialog).getByRole('button', { name: 'CAPTCHA 확인' }));
    fireEvent.submit(within(dialog).getByRole('button', { name: '가입하기' }).closest('form')!);
    await within(dialog).findByRole('status');

    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    dialog = openSignup();

    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('guest@example.com')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('회원가입 이메일')).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: '가입하기' })).toBeDisabled();
  });
});
