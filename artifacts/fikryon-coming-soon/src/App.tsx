import { type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import ComingSoon from '@/pages/coming-soon';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={ComingSoon} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </WouterRouter>
  );
}

export default App;
