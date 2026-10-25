import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { OfflineBanner } from './OfflineBanner';
import { PendingInviteNotice } from '../team/PendingInviteNotice';
import { ToastContainer } from '../ui/Toast';

function PageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <OfflineBanner />
      <Sidebar />
      <main className="lg:ml-64 min-h-screen">
        <div className="p-3 sm:p-4 lg:p-8 pt-20 lg:pt-8">
          <PendingInviteNotice />
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
