import { lazy } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { initializeData, migrateStorageIfNeeded } from './services/storage';
import { migrateIndexedPhotosToDisk } from './services/photoStorage';
import { maybeRunAutoBackup } from './services/backupService';
import { LanguageProvider } from './i18n';
import { AuthProvider } from './contexts/AuthContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Layout } from './components/layout/Layout';
import { RequirePermission } from './components/auth/RequirePermission';

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const OrdersPage = lazy(() => import('./pages/OrdersPage').then(m => ({ default: m.OrdersPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then(m => ({ default: m.CustomersPage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const WastePage = lazy(() => import('./pages/WastePage').then(m => ({ default: m.WastePage })));
const BouquetsPage = lazy(() => import('./pages/BouquetsPage').then(m => ({ default: m.BouquetsPage })));
const DeliveriesPage = lazy(() => import('./pages/DeliveriesPage').then(m => ({ default: m.DeliveriesPage })));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage').then(m => ({ default: m.StatisticsPage })));
const FinancePage = lazy(() => import('./pages/FinancePage').then(m => ({ default: m.FinancePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })));
const ReservationsPage = lazy(() => import('./pages/ReservationsPage').then(m => ({ default: m.ReservationsPage })));
const InventoryCalculatorPage = lazy(() => import('./pages/InventoryCalculatorPage').then(m => ({ default: m.InventoryCalculatorPage })));
const ThemesPage = lazy(() => import('./pages/ThemesPage').then(m => ({ default: m.ThemesPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));

// Electron loads the built app over file:// where history.pushState is not
// reliable. The browser/PWA build keeps clean URLs with BrowserRouter.
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

function App() {
  useEffect(() => {
    migrateStorageIfNeeded();
    initializeData();
    // Desktop app only: move photos saved via the IndexedDB fallback to disk.
    void migrateIndexedPhotosToDisk();
    // Automatic backup on start (no-op outside the desktop app / when disabled).
    void maybeRunAutoBackup();
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <PermissionsProvider>
          <ThemeProvider>
            <Router>
              <Routes>
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/" element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="orders" element={<OrdersPage />} />
                  <Route path="customers" element={<CustomersPage />} />
                  <Route path="inventory" element={<InventoryPage />} />
                  <Route path="inventory/waste" element={<WastePage />} />
                  <Route path="inventory/calculator" element={<InventoryCalculatorPage />} />
                  <Route path="bouquets" element={<BouquetsPage />} />
                  <Route path="deliveries" element={<DeliveriesPage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="reservations" element={<ReservationsPage />} />
                  <Route path="history" element={<HistoryPage />} />
                  <Route path="statistics" element={<RequirePermission permission="viewStatistics"><StatisticsPage /></RequirePermission>} />
                  <Route path="finance" element={<RequirePermission permission="manageFinance"><FinancePage /></RequirePermission>} />
                  <Route path="settings" element={<RequirePermission permission="manageSettings"><SettingsPage /></RequirePermission>} />
                  <Route path="themes" element={<ThemesPage />} />
                </Route>
              </Routes>
            </Router>
          </ThemeProvider>
        </PermissionsProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
