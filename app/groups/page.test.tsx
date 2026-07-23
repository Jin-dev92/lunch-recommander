import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from '../../lib/supabaseClient';
import GroupsPage from './page';

const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

describe('그룹', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('생성과 가입 입력을 표시합니다', () => {
    render(<GroupsPage />);
    expect(screen.getByLabelText('그룹 이름')).toBeInTheDocument();
    expect(screen.getByLabelText('초대코드')).toBeInTheDocument();
  });

  it('추천 화면으로 돌아가는 링크를 보여줍니다', () => {
    render(<GroupsPage />);
    expect(screen.getByRole('link', { name: '추천 화면으로' })).toHaveAttribute('href', '/');
  });

  it('그룹 생성 성공 시 초대코드를 표시합니다', async () => {
    rpc.mockResolvedValue({
      data: [{ group_id: 'g1', invite_code: 'ABC123DEF456' }],
      error: null,
    });
    render(<GroupsPage />);
    fireEvent.change(screen.getByLabelText('그룹 이름'), {
      target: { value: '점심팀' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '그룹 생성' }).closest('form')!);
    await waitFor(() => expect(screen.getByText('초대코드: ABC123DEF456')).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith('create_group', { group_name: '점심팀' });
  });

  it('초대코드 가입 성공 시 안내 메시지를 표시합니다', async () => {
    rpc.mockResolvedValue({ error: null });
    render(<GroupsPage />);
    fireEvent.change(screen.getByLabelText('초대코드'), {
      target: { value: 'ABC123DEF456' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '그룹 가입' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('그룹에 가입했습니다.'),
    );
    expect(rpc).toHaveBeenCalledWith('join_group_by_code', {
      code: 'ABC123DEF456',
    });
  });

  it('잘못된 초대코드로 가입 시 에러 메시지를 표시합니다', async () => {
    rpc.mockResolvedValue({
      error: { message: '유효하지 않은 초대코드입니다' },
    });
    render(<GroupsPage />);
    fireEvent.change(screen.getByLabelText('초대코드'), {
      target: { value: 'WRONGCODE' },
    });
    fireEvent.submit(screen.getByRole('button', { name: '그룹 가입' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('유효하지 않은 초대코드입니다'),
    );
  });

  it('생성 성공 후 실패한 재요청에서 이전 초대코드가 남지 않습니다', async () => {
    render(<GroupsPage />);
    const submitCreate = () =>
      fireEvent.submit(screen.getByRole('button', { name: '그룹 생성' }).closest('form')!);

    rpc.mockResolvedValueOnce({
      data: [{ group_id: 'g1', invite_code: 'ABC123DEF456' }],
      error: null,
    });
    fireEvent.change(screen.getByLabelText('그룹 이름'), {
      target: { value: '점심팀' },
    });
    submitCreate();
    await waitFor(() => expect(screen.getByText('초대코드: ABC123DEF456')).toBeInTheDocument());

    rpc.mockResolvedValueOnce({ error: { message: '그룹 생성 실패' } });
    fireEvent.change(screen.getByLabelText('그룹 이름'), {
      target: { value: '실패팀' },
    });
    submitCreate();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('그룹 생성 실패'));
    expect(screen.queryByText('초대코드: ABC123DEF456')).not.toBeInTheDocument();
  });

  it('실패한 요청 후 성공한 재요청에서 이전 에러 메시지가 남지 않습니다', async () => {
    render(<GroupsPage />);
    const submitCreate = () =>
      fireEvent.submit(screen.getByRole('button', { name: '그룹 생성' }).closest('form')!);

    rpc.mockResolvedValueOnce({ error: { message: '그룹 생성 실패' } });
    fireEvent.change(screen.getByLabelText('그룹 이름'), {
      target: { value: '실패팀' },
    });
    submitCreate();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('그룹 생성 실패'));

    rpc.mockResolvedValueOnce({
      data: [{ group_id: 'g2', invite_code: 'XYZ789GHI012' }],
      error: null,
    });
    fireEvent.change(screen.getByLabelText('그룹 이름'), {
      target: { value: '점심팀' },
    });
    submitCreate();
    await waitFor(() => expect(screen.getByText('초대코드: XYZ789GHI012')).toBeInTheDocument());
    expect(screen.queryByText('그룹 생성 실패')).not.toBeInTheDocument();
  });
});
