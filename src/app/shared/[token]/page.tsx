'use client';
import { use, useState } from 'react';
export default function SharedDocument({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [password, setPassword] = useState('');
  const [document, setDocument] = useState<{ name: string; text: string; allowDownload: boolean } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function open(download = false) {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/v1/shared/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, download }) });
      if (!response.ok) { setError((await response.json()).error); return; }
      if (download) {
        const url = URL.createObjectURL(await response.blob());
        const link = window.document.createElement('a'); link.href = url; link.download = document?.name || 'document'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else setDocument(await response.json());
    } catch { setError('Unable to open this document. Please retry.'); }
    finally { setLoading(false); }
  }
  return <main className="mx-auto max-w-4xl p-6 sm:p-10">
    <h1 className="mb-6 text-2xl font-semibold">{document?.name || 'Shared document'}</h1>
    {!document && <form onSubmit={event => { event.preventDefault(); void open(); }} className="flex max-w-md flex-col gap-4">
      <label htmlFor="password">Password, if required</label>
      <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="rounded-md border bg-background p-3" />
      <button disabled={loading} className="rounded-md bg-primary p-3 text-primary-foreground">{loading ? 'Opening…' : 'Open document'}</button>
    </form>}
    {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}
    {document && <><pre className="whitespace-pre-wrap rounded-lg border p-5 font-sans leading-relaxed">{document.text}</pre>
      {document.allowDownload && <button disabled={loading} onClick={() => void open(true)} className="mt-5 rounded-md bg-primary px-4 py-2 text-primary-foreground">Download</button>}</>}
  </main>;
}
