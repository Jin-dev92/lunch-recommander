'use client';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateGroup, useJoinGroup } from '../lib/hooks/mutations';
import { errorMessage, MESSAGES } from '../lib/messages';
import type { CreateGroupRequest, JoinGroupRequest } from '../lib/types/api';
import styles from './GroupManager.module.css';

/**
 * 그룹 생성·가입을 모달에서 처리한다. 별도 페이지 대신 홈에서 바로 연다.
 * 초대코드·안내·에러는 모두 mutation 상태에서 파생하므로, 모달을 열 때 reset으로 지운다.
 */
export default function GroupManager() {
  const dialog = useRef<HTMLDialogElement>(null);
  const createGroup = useCreateGroup();
  const joinGroup = useJoinGroup();
  const createForm = useForm<CreateGroupRequest>();
  const joinForm = useForm<JoinGroupRequest>();

  function open() {
    createGroup.reset();
    joinGroup.reset();
    createForm.reset();
    joinForm.reset();
    dialog.current?.showModal();
  }

  // 한쪽을 새로 요청하면 다른 쪽 결과가 화면에 남지 않도록 reset()으로 지운다.
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
    <>
      <button className={styles.trigger} type="button" onClick={open}>
        그룹 관리
      </button>

      <dialog className={styles.dialog} ref={dialog} aria-labelledby="group-manager-title">
        <h2 className={styles.title} id="group-manager-title">
          그룹 관리
        </h2>
        <p className={styles.description}>
          그룹을 만들어 초대코드를 공유하거나, 받은 초대코드로 그룹에 가입하세요.
        </p>

        <form className={styles.form} onSubmit={create}>
          <label className={styles.field}>
            그룹 이름
            <input
              className={styles.input}
              required
              {...createForm.register('name', { required: true })}
            />
          </label>
          <button className={styles.submit} disabled={createGroup.isPending}>
            그룹 생성
          </button>
        </form>
        {createGroup.isSuccess && (
          <output className={styles.invite}>초대코드: {createGroup.data}</output>
        )}

        <hr className={styles.divider} />

        <form className={styles.form} onSubmit={join}>
          <label className={styles.field}>
            초대코드
            <input
              className={styles.input}
              required
              {...joinForm.register('code', { required: true })}
            />
          </label>
          <button className={styles.submit} disabled={joinGroup.isPending}>
            그룹 가입
          </button>
        </form>
        {joinGroup.isSuccess && (
          <p className={styles.status} role="status">
            {MESSAGES.GROUP_JOINED}
          </p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button className={styles.close} type="button" onClick={() => dialog.current?.close()}>
          닫기
        </button>
      </dialog>
    </>
  );
}
