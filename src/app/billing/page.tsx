import { Suspense } from 'react';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import { BillingDashboard } from '@/components/billing';


export const metadata = {
  title: 'Billing & Subscription | Document Chat System',
  description: 'Manage your subscription, view usage, and billing information.',
};


export default async function BillingPage() {
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in/');
  }

  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
            <p className="text-muted-foreground">
              Manage your subscription, view usage statistics, and upgrade your plan.
            </p>
          </div>

          <Suspense fallback={<div>Loading billing...</div>}>
            <BillingDashboard />
          </Suspense>
        </div>
      </div>
    </AppLayout>
  );
}
