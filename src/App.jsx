import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { SystemProvider } from './context/SystemContext';
import { ThemeProvider } from './context/ThemeContext';
import { MainLayout } from './components/layout/MainLayout';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Páginas Existentes (Fases 01-10)
import { DesktopPage } from './pages/DesktopPage';
import { OverviewPage } from './pages/OverviewPage';
import { TerminalPage } from './pages/TerminalPage';
import { ProcessesPage } from './pages/ProcessesPage';
import { ResourceMonitorPage } from './pages/ResourceMonitorPage';
import { MemoryPage } from './pages/MemoryPage';
import { DevicesPage } from './pages/DevicesPage';
import { FileExplorerPage } from './pages/FileExplorerPage';
import { SettingsPage } from './pages/SettingsPage';
import { ConcurrencyLabPage } from './pages/ConcurrencyLabPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { BenchmarkPage } from './pages/BenchmarkPage';
import { LogsAlertsPage } from './pages/LogsAlertsPage';

// Páginas de Fase 11 (UX, Auth y Observabilidad)
import { LoginPage } from './pages/LoginPage';
import { WelcomePage } from './pages/WelcomePage';
import { DashboardPage } from './pages/DashboardPage';
import { ObservabilityCenter } from './pages/ObservabilityCenter';
import { UserAuditPage } from './pages/UserAuditPage';

export default function App() {
  // Requisito Fase 11A: El sistema inicia siempre en /login
  const [currentScreen, setCurrentScreen] = useState('login');

  const renderScreen = () => {
    switch (currentScreen) {
      // Fase 11A & 11B & 11D
      case 'login':
        return <LoginPage onNavigate={setCurrentScreen} />;
      case 'welcome':
        return <WelcomePage onNavigate={setCurrentScreen} />;
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentScreen} />;
      
      // Fase 11F & 11G
      case 'observability':
        return <ObservabilityCenter onNavigate={setCurrentScreen} />;
      case 'user-audit':
        return <UserAuditPage onNavigate={setCurrentScreen} />;

      // Páginas Preservadas de Fases 01-10
      case 'desktop':
        return <DesktopPage onNavigate={setCurrentScreen} />;
      case 'overview':
        return <OverviewPage onNavigate={setCurrentScreen} />;
      case 'terminal':
        return <TerminalPage onNavigate={setCurrentScreen} />;
      case 'processes':
        return <ProcessesPage onNavigate={setCurrentScreen} />;
      case 'resource-monitor':
        return <ResourceMonitorPage onNavigate={setCurrentScreen} />;
      case 'concurrency-lab':
        return <ConcurrencyLabPage onNavigate={setCurrentScreen} />;
      case 'memory':
        return <MemoryPage onNavigate={setCurrentScreen} />;
      case 'devices':
        return <DevicesPage onNavigate={setCurrentScreen} />;
      case 'file-explorer':
        return <FileExplorerPage onNavigate={setCurrentScreen} />;
      case 'diagnostics':
        return <DiagnosticsPage onNavigate={setCurrentScreen} />;
      case 'benchmark':
        return <BenchmarkPage onNavigate={setCurrentScreen} />;
      case 'settings':
        return <SettingsPage onNavigate={setCurrentScreen} />;
      case 'logs-alerts':
        return <LogsAlertsPage onNavigate={setCurrentScreen} />;

      default:
        return <DashboardPage onNavigate={setCurrentScreen} />;
    }
  };

  return (
    <ThemeProvider>
      <AuthProvider>
        <SystemProvider>
          <MainLayout currentScreen={currentScreen} onNavigate={setCurrentScreen}>
            <ErrorBoundary componentName="Pantalla de Sistema" onNavigate={setCurrentScreen}>
              {renderScreen()}
            </ErrorBoundary>
          </MainLayout>
        </SystemProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
