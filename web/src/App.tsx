import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ChatProvider } from './components/ChatContext';
import { JobsProvider } from './components/Jobs';
import { Layout } from './components/Layout';
import { TendersPage } from './components/TendersPage';
import { TenderDetailPage } from './components/TenderDetailPage';
import { CompetitorsPage } from './components/CompetitorsPage';
import { CompetitorDetailPage } from './components/CompetitorDetailPage';
import { CompanyPage } from './components/CompanyPage';
import { AutopilotPage } from './components/Autopilot';
import { Landing } from './components/Landing';
import { Hackathon } from './components/Hackathon';
import { LoginPage, RequireAuth } from './Login';
import { ConsentPage } from './Consent';
import { PartnersPage } from './components/Partners';
import { JoinFromInvitePage, PartnerRespondPage } from './components/PartnerRespond';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route index element={<Landing />} />
        <Route path="hackathon" element={<Hackathon />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="oauth/consent" element={<ConsentPage />} />
        {/* Partner invite response (token-scoped, no login) and joining Radar from it */}
        <Route path="p/:token" element={<PartnerRespondPage />} />
        <Route path="join/:token" element={<RequireAuth><JoinFromInvitePage /></RequireAuth>} />

        {/* Signed-in workspace */}
        <Route
          element={
            <RequireAuth>
              <JobsProvider>
                <ChatProvider>
                  <Layout />
                </ChatProvider>
              </JobsProvider>
            </RequireAuth>
          }
        >
          <Route path="autopilot" element={<AutopilotPage />} />
          <Route path="tenders" element={<TendersPage />} />
          <Route path="tenders/:id" element={<TenderDetailPage />} />
          <Route path="competitors" element={<CompetitorsPage />} />
          <Route path="competitors/:id" element={<CompetitorDetailPage />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="company" element={<CompanyPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
