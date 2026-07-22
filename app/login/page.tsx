'use client';
import { FormEvent,useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
export default function LoginPage(){const [error,setError]=useState('');async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const data=new FormData(e.currentTarget);const {error}=await supabase.auth.signInWithPassword({email:String(data.get('email')),password:String(data.get('password'))});if(error){setError(error.message);}else{document.cookie='sb-session=1; path=/; max-age=604800; samesite=lax';location.assign('/');}}return <form onSubmit={submit}><label>이메일<input name="email" type="email" required/></label><label>비밀번호<input name="password" type="password" required/></label><button>로그인</button>{error&&<p role="alert">{error}</p>}</form>;}
