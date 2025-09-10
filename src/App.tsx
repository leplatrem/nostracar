import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from 'react-router-dom';
import {
  Send as SendIcon,
  Car as CarIcon,
  MessageSquare as MessageSquareIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
} from 'lucide-react';

import { useThemeMode } from './hooks/settings';

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8 space-y-6">
      <HeaderNav />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/publish" element={<PublishPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <FooterNote />
    </div>
  );
}

function HeaderNav() {
  const { pathname } = useLocation();

  function MenuLink({
    to,
    children,
  }: {
    to: string;
    children: React.ReactNode;
  }) {
    return (
      <Link
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${
          pathname === to
            ? 'bg-primary text-primary-foreground'
            : 'bg-background hover:bg-muted'
        }`}
        to={to}
      >
        {children}
      </Link>
    );
  }

  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <CarIcon className="h-8 w-8" />
        <h1 className="text-2xl md:text-3xl font-semibold">Nostracar</h1>
      </div>
      <nav className="flex flex-wrap gap-2">
        <MenuLink to="/">
          <SearchIcon className="h-4 w-4" /> Home
        </MenuLink>
        <MenuLink to="/publish">
          <SendIcon className="h-4 w-4" /> Publish
        </MenuLink>
        <MenuLink to="/inbox">
          <MessageSquareIcon className="h-4 w-4" /> Inbox
        </MenuLink>
        <MenuLink to="/settings">
          <SettingsIcon className="h-4 w-4" /> Settings
        </MenuLink>
      </nav>
    </header>
  );
}

function FooterNote() {
  return (
    <footer className="text-xs text-muted-foreground text-center">
      This is a proof-of-concept. Data is public on relays. Use at your own
      risk.
    </footer>
  );
}

function HomePage() {
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">Home</h2>
      {/* Search and list trips here
        - From
        - To
        - Date */}
    </div>
  );
}

function PublishPage() {
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">Publish</h2>
      {/* Form to publish a new trip here
        - From
        - To
        - Date
        - Time
        - Seats available
        - Price
        - Additional info
      */}
    </div>
  );
}

function InboxPage() {
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">Inbox</h2>
      {/* List of received messages here */}
    </div>
  );
}

function SettingsPage() {
  const [mode, setMode] = useThemeMode();

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-semibold">Settings</h2>

      <h3 className="text-lg font-medium">Relays</h3>
      <h3 className="text-lg font-medium">Private key</h3>
      <h3 className="text-lg font-medium">Theme</h3>
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="theme"
            value="light"
            checked={mode === 'light'}
            onChange={() => setMode('light')}
          />
          <span>Light</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="theme"
            value="dark"
            checked={mode === 'dark'}
            onChange={() => setMode('dark')}
          />
          <span>Dark</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="theme"
            value="auto"
            checked={mode === 'auto'}
            onChange={() => setMode('auto')}
          />
          <span>Auto (system)</span>
        </label>
      </div>
    </div>
  );
}
