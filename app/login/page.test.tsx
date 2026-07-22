import { render,screen } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
vi.mock('../../lib/supabaseClient',()=>({supabase:{auth:{signInWithPassword:vi.fn()}}}));
import LoginPage from './page';

describe('로그인',()=>{it('이메일과 비밀번호 입력을 표시합니다',()=>{render(<LoginPage/>);expect(screen.getByLabelText('이메일')).toBeInTheDocument();expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();expect(screen.getByRole('button',{name:'로그인'})).toBeInTheDocument();});});
