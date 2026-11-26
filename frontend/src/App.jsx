// === filename: frontend/src/App.jsx ===
import { Component, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import DetailPanel from './components/layout/DetailPanel.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import TopBar from './components/layout/TopBar.jsx';
import Spinner from './components/ui/Spinner.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { AppRoutes } from './router.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useSiemStore } from './store.js';

/** Catch page-level rendering failures and keep navigation available. */
class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('OpenHomeSIEM page failed to render', error);
  }

  render() {
    if (this.state.failed) return <div className="error-boundary"><h2>Workspace unavailable</h2><p>This page hit a rendering error. Use the navigation to open another section or refresh the application.</p><button className="button button-secondary" onClick={() => this.setState({ failed: false })}>Try again</button></div>;
    return this.props.children;
  }
}

function ApplicationBootstrap() {
  const loadDashboard = useSiemStore((state) => state.loadDashboard);
  const loadDevices = useSiemStore((state) => state.loadDevices);
  const loadAnomalies = useSiemStore((state) => state.loadAnomalies);
  const loadAlerts = useSiemStore((state) => state.loadAlerts);
  const loadHealth = useSiemStore((state) => state.loadHealth);
  useWebSocket();
  useEffect(() => {
    loadDashboard();
    loadDevices();
    loadAnomalies();
    loadAlerts();
    loadHealth();
    const timer = window.setInterval(loadHealth, 30000);
    return () => window.clearInterval(timer);
  }, [loadDashboard, loadDevices, loadAnomalies, loadAlerts, loadHealth]);
  return null;
}

/** Shell containing fixed chrome, route workspace, and the event inspector. */
export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [path, setLocation] = useLocation();
  const dashboardLoading = useSiemStore((state) => state.loading.dashboard);
  const setSelectedRecord = useSiemStore((state) => state.setSelectedRecord);
  useEffect(() => {
    const destinations = ['/dashboard', '/explorer', '/threats', '/timeline', '/devices', '/alerts', '/reports'];
    const onShortcut = (event) => {
      const target = event.target;
      const editing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === 'Escape') { setSelectedRecord(null); return; }
      if (editing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '/') {
        event.preventDefault(); setLocation('/explorer');
        window.setTimeout(() => document.querySelector('.search-box input')?.focus(), 0);
      }
      const index = Number(event.key) - 1;
      if (index >= 0 && index < destinations.length) setLocation(destinations[index]);
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [setLocation, setSelectedRecord]);
  return (
    <ToastProvider>
      <ApplicationBootstrap />
      <div className={`app-shell ${collapsed ? 'nav-collapsed' : ''}`}>
        <TopBar />
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        <main className="main-content" id="main-content" key={path}>
          <SectionErrorBoundary><AppRoutes /></SectionErrorBoundary>
          {dashboardLoading && <div className="connection-note"><Spinner size="small" /> Syncing collector data</div>}
        </main>
        <DetailPanel />
      </div>
    </ToastProvider>
  );
}
