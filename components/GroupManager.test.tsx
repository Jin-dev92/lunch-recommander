import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from '../lib/supabaseClient';
import { renderWithQuery } from '../tests/renderWithQuery';
import GroupManager from './GroupManager';

const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

function open() {
  renderWithQuery(<GroupManager />);
  fireEvent.click(screen.getByRole('button', { name: '그룹 관리' }));
}

function createGroupSubmit() {
  return fireEvent.submit(screen.getByRole('button', { name: '그룹 생성' }).closest('form')!);
}

describe('그룹 관리 모달', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('열기 전에는 모달이 열려 있지 않습니다', () => {
    renderWithQuery(<GroupManager />);
    // 닫힌 <dialog>는 접근성 트리에서 빠지므로 dialog role로 열림 여부를 판단한다.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그룹 관리' })).toBeInTheDocument();
  });

  it('버튼을 누르면 생성·가입 입력이 있는 모달이 열립니다', () => {
    open();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('그룹 이름')).toBeInTheDocument();
    expect(screen.getByLabelText('초대코드')).toBeInTheDocument();
  });

  it('닫기를 누르면 모달이 닫힙니다', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('그룹 생성 성공 시 초대코드를 표시합니다', async () => {
    rpc.mockResolvedValue({ data: [{ group_id: 'g1', invite_code: 'ABC123DEF456' }], error: null });
    open();
    fireEvent.change(screen.getByLabelText('그룹 이름'), { target: { value: '점심팀' } });
    createGroupSubmit();
    await waitFor(() => expect(screen.getByText('초대코드: ABC123DEF456')).toBeInTheDocument());
    expect(rpc).toHaveBeenCalledWith('create_group', { group_name: '점심팀' });
  });

  it('그룹 생성 중 실행한 버튼에 공통 스피너를 보여줍니다', async () => {
    rpc.mockReturnValue(new Promise(() => {}));
    open();
    fireEvent.change(screen.getByLabelText('그룹 이름'), { target: { value: '점심팀' } });
    createGroupSubmit();

    const button = await screen.findByRole('button', { name: '생성 중…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('초대코드 가입 성공 시 안내 메시지를 표시합니다', async () => {
    rpc.mockResolvedValue({ error: null });
    open();
    fireEvent.change(screen.getByLabelText('초대코드'), { target: { value: 'ABC123DEF456' } });
    fireEvent.submit(screen.getByRole('button', { name: '그룹 가입' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('그룹에 가입했습니다.'),
    );
    expect(rpc).toHaveBeenCalledWith('join_group_by_code', { code: 'ABC123DEF456' });
  });

  it('잘못된 초대코드로 가입 시 에러 메시지를 표시합니다', async () => {
    rpc.mockResolvedValue({ error: { message: '유효하지 않은 초대코드입니다' } });
    open();
    fireEvent.change(screen.getByLabelText('초대코드'), { target: { value: 'WRONGCODE' } });
    fireEvent.submit(screen.getByRole('button', { name: '그룹 가입' }).closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('유효하지 않은 초대코드입니다'),
    );
  });

  it('생성 성공 후 실패한 재요청에서 이전 초대코드가 남지 않습니다', async () => {
    open();
    rpc.mockResolvedValueOnce({
      data: [{ group_id: 'g1', invite_code: 'ABC123DEF456' }],
      error: null,
    });
    fireEvent.change(screen.getByLabelText('그룹 이름'), { target: { value: '점심팀' } });
    createGroupSubmit();
    await waitFor(() => expect(screen.getByText('초대코드: ABC123DEF456')).toBeInTheDocument());

    rpc.mockResolvedValueOnce({ error: { message: '그룹 생성 실패' } });
    fireEvent.change(screen.getByLabelText('그룹 이름'), { target: { value: '실패팀' } });
    createGroupSubmit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('그룹 생성 실패'));
    expect(screen.queryByText('초대코드: ABC123DEF456')).not.toBeInTheDocument();
  });

  it('다시 열면 이전 결과가 남지 않습니다', async () => {
    rpc.mockResolvedValue({ data: [{ group_id: 'g1', invite_code: 'ABC123DEF456' }], error: null });
    open();
    fireEvent.change(screen.getByLabelText('그룹 이름'), { target: { value: '점심팀' } });
    createGroupSubmit();
    await waitFor(() => expect(screen.getByText('초대코드: ABC123DEF456')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '그룹 관리' }));

    expect(screen.queryByText('초대코드: ABC123DEF456')).not.toBeInTheDocument();
    expect(screen.getByLabelText('그룹 이름')).toHaveValue('');
  });
});
