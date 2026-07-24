'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { ROUTES } from '../../lib/constants';
import { useCreateGroup, useJoinGroup } from '../../lib/hooks/mutations';
import { errorMessage, MESSAGES } from '../../lib/messages';
import type { CreateGroupRequest, JoinGroupRequest } from '../../lib/types/api';

export default function GroupsPage() {
  const createGroup = useCreateGroup();
  const joinGroup = useJoinGroup();
  const createForm = useForm<CreateGroupRequest>();
  const joinForm = useForm<JoinGroupRequest>();

  // 초대코드·안내·에러는 모두 mutation 상태에서 파생된다. 한쪽을 새로 요청하면
  // 다른 쪽 결과가 화면에 남지 않도록 reset()으로 지운다.
  const create = createForm.handleSubmit((values) => {
    joinGroup.reset();
    createGroup.mutate(values);
  });

  const join = joinForm.handleSubmit((values) => {
    createGroup.reset();
    joinGroup.mutate({ code: values.code.trim() });
  });

  const error = createGroup.isError
    ? errorMessage(createGroup.error)
    : joinGroup.isError
      ? errorMessage(joinGroup.error)
      : '';

  return (
    <main>
      <Link href={ROUTES.HOME}>추천 화면으로</Link>
      <form onSubmit={create}>
        <label>
          그룹 이름
          <input required {...createForm.register('name', { required: true })} />
        </label>
        <button disabled={createGroup.isPending}>그룹 생성</button>
      </form>
      {createGroup.isSuccess && <output>초대코드: {createGroup.data}</output>}
      <form onSubmit={join}>
        <label>
          초대코드
          <input required {...joinForm.register('code', { required: true })} />
        </label>
        <button disabled={joinGroup.isPending}>그룹 가입</button>
      </form>
      {joinGroup.isSuccess && <p role="status">{MESSAGES.GROUP_JOINED}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
