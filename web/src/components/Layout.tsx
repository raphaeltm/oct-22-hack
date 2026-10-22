import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { signOut, useSession } from '../auth';
import { api } from '../api';
import { useChat } from './ChatContext';
import { ChatPanel } from './ChatPanel';
import { Icon, Initials, useApi } from './ui';

const NAV = [
  { to: '/tenders', label: 'Tenders', icon: 'tenders' },
  { to: '/competitors', label: 'Competitors', icon: 'competitors' },
  { to: '/company', label: 'Company', icon: 'company' },
];

export function Layout() {
  const { open, setOpen, busy } = useChat();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className={`shell ${open ? 'chat-open' : ''}`}>
      <Sidebar />
      <main className="main" ref={mainRef}>
        <div className="main-inner">
          <Outlet />
        </div>
      </main>
      {open ? (
        <ChatPanel />
      ) : (
        <button className="chat-fab" onClick={() => setOpen(true)} title="Open chat">
          <Icon name="chat" size={20} />
          <span>Ask the agent</span>
          {busy && <span className="fab-dot" />}
        </button>
      )}
    </div>
  );
}

function Sidebar() {
  const { data: session } = useSession();
  const me = useApi(() => api.me(), []);
  const companyName = me.data?.company?.name;
  const email = session?.user.email ?? me.data?.user?.email ?? '';
  const name = session?.user.name || me.data?.user?.name || email;

  return (
    <nav className="sidebar">
      <NavLink to="/tenders" className="brand" aria-label="Radar home">
        <span className="brand-icon">◈</span>
        <span className="brand-name">radar<span className="brand-dot">.</span></span>
      </NavLink>

      <div className="nav-section">Workspace</div>
      <ul className="nav">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      {companyName && (
        <NavLink to="/company" className="company-pill">
          <Initials name={companyName} size={28} />
          <div>
            <div className="company-pill-name">{companyName}</div>
            <div className="company-pill-sub">Company profile</div>
          </div>
        </NavLink>
      )}

      <div className="sidebar-foot">
        {name && (
          <div className="user">
            <Initials name={name} size={30} />
            <div className="user-text">
              <div className="user-name">{name}</div>
              {email && email !== name && <div className="user-email">{email}</div>}
            </div>
          </div>
        )}
        {session && (
          <button type="button" className="signout-btn" onClick={() => signOut()}>
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}
