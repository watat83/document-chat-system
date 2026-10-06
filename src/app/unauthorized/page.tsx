import Link from 'next/link';
export default function UnauthorizedPage() {
  return <main className="mx-auto max-w-lg px-6 py-20"><h1 className="text-2xl font-semibold">Access required</h1><p className="mt-4">Your account does not have permission to open this page. Contact your organization administrator to request access.</p><Link className="mt-6 inline-block underline" href="/dashboard">Return to dashboard</Link></main>;
}
