import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ChatProvider } from './components/ChatContext';
import { JobsProvider } from './components/Jobs';
import { Layout } from './components/Layout';
import { TendersPage } from './components/TendersPage';
import { TenderDetailPage } from './components/TenderDetailPage';
import { CompetitorsPage } from './components/CompetitorsPage';
import { CompetitorDetailPage } from './components/CompetitorDetailPage';
import { CompanyPage } from './components/CompanyPage';

export function App() {
  return (
    <BrowserRouter>
      <JobsProvider>
        <ChatProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/tenders" replace />} />
              <Route path="tenders" element={<TendersPage />} />
              <Route path="tenders/:id" element={<TenderDetailPage />} />
              <Route path="competitors" element={<CompetitorsPage />} />
              <Route path="competitors/:id" element={<CompetitorDetailPage />} />
              <Route path="company" element={<CompanyPage />} />
              <Route path="*" element={<Navigate to="/tenders" replace />} />
            </Route>
          </Routes>
        </ChatProvider>
      </JobsProvider>
    </BrowserRouter>
  );
}
