import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
  useParams,
  useNavigate,
} from 'react-router-dom';
import {
  Send as SendIcon,
  Car as CarIcon,
  MessageSquare as MessageSquareIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
} from 'lucide-react';

import { ThemeMode, useSettings, useThemeMode } from './hooks/settings';
import { generateKey, postTrip, fetchTrips, fetchInbox, sendDM } from './nostr';
import { useEffect, useState } from 'react';
import { NostrEvent } from 'nostr-tools';

type Trip = {
  rawId: string;
  id: string;
  info: string;
  createdAt: Date;
  driver: string;
  from: string;
  to: string;
  date: string;
  time: string;
  seats: number;
  price: number;
  currency: string;
};

export function eventToTrip(event: NostrEvent): Trip {
  // 1. Create a dictionary from tags.
  // We use Record<string, string> so TS knows we can access any key.
  const eventTags = event.tags.reduce(
    (acc, [key, value]) => {
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>
  );

  // 2. Map the data with fallback values to avoid 'undefined' errors
  return {
    rawId: event.id,
    id: eventTags.d || '',
    driver: event.pubkey,
    info: event.content,
    createdAt: new Date(event.created_at * 1000),
    from: eventTags.from || '',
    to: eventTags.to || '',
    date: eventTags.date || '',
    time: eventTags.time || '',
    // Convert strings from tags back to numbers
    seats: parseInt(eventTags.seats || '0', 10),
    price: parseFloat(eventTags.price || '0'),
    currency: eventTags.currency || 'SATS',
  };
}

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
        <Route path="/message/:pubkey" element={<SendDMPage />} />
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
  const { privateKey, relays } = useSettings();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!privateKey) return;

    fetchTrips(relays, privateKey).then((entries) => {
      const parsedEntries = entries.map(eventToTrip);
      const cleanEntries = parsedEntries.filter((e: Trip) => {
        const hasFrom = e.from;
        const hasTo = e.to;
        const hasDate = e.date;
        return hasFrom && hasTo && hasDate;
      });
      setTrips(cleanEntries);
      setLoading(false);
    });
  }, [privateKey, relays]);

  if (loading) {
    return <p className="p-4">Loading...</p>;
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold">Latest Trips</h2>
      {/* Search and list trips here
        - From
        - To
        - Date */}
      {trips.length === 0 ? (
        <p className="text-muted-foreground">No trip found 😪</p>
      ) : (
        trips.map((trip) => (
          <div
            key={trip.rawId}
            className="p-4 border rounded-xl bg-card shadow-sm border-l-4 border-l-primary"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg">
                  {trip.from} ➜ {trip.to}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {trip.date} at {trip.time}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">
                  {trip.price || 'Free'}
                  {trip.currency || 'EUR'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {trip.seats} seats left
                </p>
              </div>
            </div>

            <p className="my-3 text-sm italic">&quot;{trip.info}&quot;</p>

            <div className="flex justify-between items-center pt-3 border-t">
              <span className="text-xs font-mono opacity-60">
                Driver: {trip.driver.slice(0, 8)}...
              </span>
              <button
                onClick={() =>
                  navigate(`/message/${trip.driver}`, { state: { trip } })
                }
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Contact Driver
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SendDMPage() {
  const { pubkey } = useParams();
  const { state } = useLocation(); // Contains the trip info
  const { privateKey, relays } = useSettings();
  const navigate = useNavigate();

  const initialMessage = state?.quote
    ? state?.quote
        .split('\n')
        .concat([''])
        .map((line: string) => `> ${line}\n`)
        .join('')
    : ``;
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);

  if (!pubkey || pubkey.length !== 64) {
    return <p className="p-4">Invalid driver ID.</p>;
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privateKey || !message.trim()) return;

    setSending(true);
    try {
      await sendDM(relays, privateKey, pubkey, message);
      alert('Message sent!');
      navigate('/inbox');
    } catch (err) {
      alert('Failed to send message.' + err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div className="bg-muted p-4 rounded-lg">
        <h2 className="text-sm font-semibold uppercase opacity-60">Contact</h2>
        {state?.trip ? (
          <p className="font-medium">
            {state.trip.from} to {state.trip.to} on {state.trip.date}
          </p>
        ) : (
          <p className="font-medium">To: {pubkey.slice(0, 8)}...</p>
        )}
      </div>

      <form onSubmit={handleSend} className="space-y-4">
        <textarea
          className="w-full h-40 p-4 rounded-xl border bg-background focus:ring-2 focus:ring-primary outline-none"
          placeholder="Hi! I'm interested in this trip. Can you book me a seat?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="w-full py-3 bg-primary text-white rounded-xl font-bold disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send Message'}
        </button>
      </form>
    </div>
  );
}

function PublishPage() {
  const { privateKey, relays } = useSettings();
  const [isPublishing, setIsPublishing] = useState(false);
  const [status, setStatus] = useState('');

  const [formData, setFormData] = useState({
    from: '',
    to: '',
    date: '',
    time: '',
    info: '',
    seats: '1',
    price: '',
    currency: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privateKey) {
      setStatus('❌ Please set your private key in Settings first.');
      return;
    }

    setIsPublishing(true);
    setStatus('📡 Broadcasting to relays...');

    try {
      // Use formData.info as the main content string
      await postTrip(relays, privateKey, formData.info, {
        d: `trip-${crypto.randomUUID()}`, // unique ID (for edits)
        from: formData.from,
        to: formData.to,
        date: formData.date,
        time: formData.time,
        seats: formData.seats,
        price: formData.price,
        currency: formData.currency,
      });
      setStatus('✅ Successfully published!');

      // Clear input on success
      setFormData({
        from: '',
        to: '',
        date: '',
        time: '',
        info: '',
        seats: '1',
        price: '',
        currency: '',
      });
    } catch (error) {
      console.error(error);
      setStatus('❌ Failed to publish. Check your console/relays.');
    } finally {
      setIsPublishing(false);
    }
  };

  // Helper to disable button if required fields are missing
  const isInvalid =
    !formData.from || !formData.to || !formData.date || !formData.time;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <form
        className="p-4 space-y-4 bg-card border rounded-xl shadow-sm"
        onSubmit={handleSubmit}
      >
        <h2 className="text-xl font-bold border-b pb-2">Post a New Trip</h2>

        <div className="grid grid-cols-2 gap-4">
          <input
            placeholder="From"
            className="p-2 border rounded bg-background"
            value={formData.from}
            onChange={(e) => setFormData({ ...formData, from: e.target.value })}
            disabled={isPublishing}
          />
          <input
            placeholder="To"
            className="p-2 border rounded bg-background"
            value={formData.to}
            onChange={(e) => setFormData({ ...formData, to: e.target.value })}
            disabled={isPublishing}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <input
            type="date"
            className="p-2 border rounded bg-background"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            disabled={isPublishing}
          />
          <input
            type="time"
            className="p-2 border rounded bg-background"
            value={formData.time}
            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
            disabled={isPublishing}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label
              className="text-xs text-muted-foreground ml-1"
              htmlFor="seats"
            >
              Seats
            </label>
            <input
              id="seats"
              type="number"
              min="1"
              className="p-2 border rounded bg-background"
              value={formData.seats}
              onChange={(e) =>
                setFormData({ ...formData, seats: e.target.value })
              }
              disabled={isPublishing}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              className="text-xs text-muted-foreground ml-1"
              htmlFor="price"
            >
              Price (optional)
            </label>
            <input
              id="price"
              type="number"
              placeholder="e.g. 10€"
              className="p-2 border rounded bg-background"
              value={formData.price}
              onChange={(e) =>
                setFormData({ ...formData, price: e.target.value })
              }
              disabled={isPublishing}
            />
            <select
              className="p-2 border rounded bg-background mt-1"
              value={formData.currency}
              onChange={(e) =>
                setFormData({ ...formData, currency: e.target.value })
              }
              disabled={isPublishing}
            >
              <option value="">Currency</option>
              <option value="SATS">SATS</option>
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="CNY">CNY (¥)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CHF">CHF (CHF)</option>
            </select>
          </div>
        </div>

        <textarea
          placeholder="Additional info (e.g. luggage space, car model)..."
          className="w-full h-24 p-2 border rounded bg-background"
          value={formData.info}
          onChange={(e) => setFormData({ ...formData, info: e.target.value })}
          disabled={isPublishing}
        />

        <button
          type="submit"
          className="w-full py-3 bg-primary text-white rounded-lg font-bold disabled:opacity-50 transition-opacity"
          disabled={isPublishing || isInvalid}
        >
          {isPublishing ? 'Broadcasting...' : 'Publish Trip'}
        </button>
      </form>

      <div className="flex justify-between items-center px-2">
        <span className="text-sm text-muted-foreground">
          Relays: <strong>{relays.filter((r) => r).length}</strong> active
        </span>
      </div>

      {status && (
        <div
          className={`p-4 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2
          ${status.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
        >
          {status}
        </div>
      )}
    </div>
  );
}

function InboxPage() {
  const { privateKey, relays } = useSettings();
  const [messages, setMessages] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!privateKey) return;

    fetchInbox(relays, privateKey).then((data) => {
      setMessages(data);
      setLoading(false);
    });
  }, [privateKey, relays]);

  if (loading)
    return (
      <div className="p-8 text-center animate-pulse">
        Checking your mailbox...
      </div>
    );

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Inbox</h2>

      {messages.length === 0 ? (
        <div className="p-10 border-2 border-dashed rounded-2xl text-center text-muted-foreground">
          No messages yet.
        </div>
      ) : (
        messages.map((msg) => {
          return (
            <div
              key={msg.id}
              className="p-4 bg-card border rounded-xl shadow-sm hover:border-primary transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                  From: {msg.pubkey.slice(0, 8)}...
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(msg.created_at * 1000).toLocaleString()}
                </span>
              </div>
              <p className="text-foreground">
                {msg.content.split('\n').map((item: string, key: number) => {
                  return (
                    <span key={key}>
                      {item}
                      <br />
                    </span>
                  );
                })}
              </p>
              <button
                onClick={() =>
                  navigate(`/message/${msg.pubkey}`, {
                    state: { quote: msg.content },
                  })
                }
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Reply
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

function SettingsPage() {
  const [mode, setMode] = useThemeMode();
  const { privateKey, setPrivateKey, relays, setRelays } = useSettings();

  const handleGenerateKey = async () => {
    const secretKey = await generateKey();
    setPrivateKey(secretKey);
  };

  const updateRelay = (index: number, value: string) => {
    const newRelays = [...relays];
    newRelays[index] = value;
    setRelays(newRelays); // Remove empty entries
  };

  return (
    <div className="p-4 space-y-6 max-w-lg">
      <h2 className="text-xl font-bold border-b pb-2">Settings</h2>

      {/* Private Key Section */}
      <section className="space-y-2">
        <h3 className="text-lg font-medium">Identity (Private Key)</h3>
        <input
          type="password"
          className="w-full p-2 border rounded font-mono text-sm"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          placeholder="Hex private key..."
        />
        <button
          onClick={handleGenerateKey}
          className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
        >
          Generate New Key
        </button>
        <p className="text-xs text-red-500">
          Keep this safe! If you lose it, you lose your account.
        </p>
      </section>

      {/* Relays Section */}
      <section className="space-y-2">
        <h3 className="text-lg font-medium">Relays</h3>
        {relays.map((url, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="flex-1 p-2 border rounded text-sm bg-background text-foreground"
              value={url}
              onChange={(e) => updateRelay(i, e.target.value)}
              placeholder="wss://..."
            />
            <button
              onClick={() =>
                setRelays(relays.filter((_, index) => index !== i))
              }
              className="text-red-500 px-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setRelays([...relays, ''])}
          className="text-xs border px-3 py-1 rounded"
        >
          + Add Relay
        </button>
      </section>

      {/* Theme Section */}
      <section className="space-y-2">
        <h3 className="text-lg font-medium">Theme</h3>
        <div className="flex gap-4">
          {['light', 'dark', 'auto'].map((t) => (
            <label
              key={t}
              className="flex items-center gap-2 cursor-pointer capitalize"
            >
              <input
                type="radio"
                name="theme"
                checked={mode === t}
                onChange={() => setMode(t as ThemeMode)}
              />
              <span>{t}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
