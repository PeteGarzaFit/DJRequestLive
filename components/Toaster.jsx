import React, { useEffect, useState } from 'react';

export default function Toaster() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let t;
    const on = (e) => { setMsg(e.detail); clearTimeout(t); t = setTimeout(() => setMsg(''), 2600); };
    window.addEventListener('rl-toast', on);
    return () => { window.removeEventListener('rl-toast', on); clearTimeout(t); };
  }, []);
  return <div className={'rl-toast' + (msg ? ' show' : '')} role="status">{msg}</div>;
}
