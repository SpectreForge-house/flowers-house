import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { OfflineBanner } from './OfflineBanner';
import { PendingInviteNotice } from '../team/PendingInviteNotice';
import { AutoCloudSwitch } from '../cloud/AutoCloudSwitch';
import { CloudSwitchNotice } from '../cloud/CloudSwitchNotice';
import { ClientDateNotificationSync } from '../notifications/ClientDateNotificationSync';
import { FinanceReminderSync } from '../notifications/FinanceReminderSync';
import { ToastContainer } from '../ui/Toast';
import { usePermissions } from '../../contexts/PermissionsContext';

function PageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const { can } = usePermissions();

  return (
    <div className="min-h-screen bg-background">
      <AutoCloudSwitch />
      <OfflineBanner />
      <Sidebar />
      <main className="lg:ml-64 min-h-screen">
        <div className="p-3 sm:p-4 lg:p-8 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:pt-8 pb-24 lg:pb-8">
          <CloudSwitchNotice />
          <PendingInviteNotice />
          <div key={location.pathname} className="page-transition">
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </main>
      <MobileNav />
      <ClientDateNotificationSync />
      {can('manageFinance') && <FinanceReminderSync />}
      <ToastContainer />
    </div>
  );
}
