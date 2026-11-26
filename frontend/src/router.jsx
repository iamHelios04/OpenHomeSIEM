// === filename: frontend/src/router.jsx ===
import { lazy, Suspense } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import Spinner from './components/ui/Spinner.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const LogExplorer = lazy(() => import('./pages/LogExplorer.jsx'));
const ThreatMap = lazy(() => import('./pages/ThreatMap.jsx'));
const Timeline = lazy(() => import('./pages/Timeline.jsx'));
const Devices = lazy(() => import('./pages/Devices.jsx'));
const Alerts = lazy(() => import('./pages/Alerts.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));

/** Route switch for all SIEM workspaces. */
export function AppRoutes() {
  return (
    <Suspense fallback={<div className="page-loading"><Spinner label="Loading workspace" /> Loading workspace…</div>}>
      <Switch>
        <Route path="/"><Redirect to="/dashboard" /></Route>
        <Route path="/dashboard"><Dashboard /></Route>
        <Route path="/explorer"><LogExplorer /></Route>
        <Route path="/threats"><ThreatMap /></Route>
        <Route path="/timeline"><Timeline /></Route>
        <Route path="/devices"><Devices /></Route>
        <Route path="/alerts"><Alerts /></Route>
        <Route path="/reports"><Reports /></Route>
        <Route><Redirect to="/dashboard" /></Route>
      </Switch>
    </Suspense>
  );
}
