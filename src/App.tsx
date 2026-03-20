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
import { Toast, useToast } from './hooks/toast';
import {
  generateKey,
  postTrip,
  fetchTrips,
  fetchInbox,
  sendDM,
  deleteEvent,
  asPublicKey,
} from './nostr';
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
  const eventTags = event.tags.reduce(
    (acc, [key, value]) => {
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>
  );

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
    seats: parseInt(eventTags.seats || '0', 10),
    price: parseFloat(eventTags.price || '0'),
    currency: eventTags.currency || 'SATS',
  };
}

// ─── Shared UI ────────────────────────────────────────────────────

function LoadingState({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <div className="h-7 w-7 rounded-full border-[3px] border-muted border-t-primary animate-spin" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function NoKeyWarning() {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center space-y-3">
      <p className="text-muted-foreground text-sm">
        No private key configured.
      </p>
      <Link
        to="/settings"
        className="inline-block text-sm font-medium text-primary hover:underline"
      >
        Go to Settings →
      </Link>
    </div>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
      {children}
    </label>
  );
}

// ─── App shell ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter basename="/nostracar/">
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

function RelayStatus() {
  const { relays } = useSettings();
  const count = relays.length;

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs text-muted-foreground bg-background">
      <span
        className={`h-1.5 w-1.5 rounded-full ${count > 0 ? 'bg-green-500' : 'bg-red-500'}`}
      />
      {count} relay{count !== 1 ? 's' : ''}
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
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
          pathname === to
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background hover:bg-muted border-border'
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
        <CarIcon className="h-8 w-8 text-primary" />
        <h1 className="text-2xl md:text-3xl font-semibold">Nostracar</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
        <RelayStatus />
      </div>
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

// ─── Pages ───────────────────────────────────────────────────────────────────

function TripCard({
  trip,
  myPubKey,
  onCancel,
}: {
  trip: Trip;
  myPubKey: string;
  onCancel: (id: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="p-4 border rounded-xl bg-card shadow-sm border-l-4 border-l-primary">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h3 className="font-semibold text-base">
            {trip.from} ➜ {trip.to}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {trip.date} at {trip.time}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-primary">
            {trip.price ? `${trip.price} ${trip.currency}` : 'Free'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {trip.seats} seat{trip.seats !== 1 ? 's' : ''} left
          </p>
        </div>
      </div>

      {trip.info && (
        <p className="mt-3 text-sm text-muted-foreground italic">
          &quot;{trip.info}&quot;
        </p>
      )}

      <div className="flex justify-between items-center mt-3 pt-3 border-t">
        <span className="text-xs font-mono text-muted-foreground">
          {trip.driver.slice(0, 8)}…
        </span>
        {trip.driver === myPubKey ? (
          <button
            onClick={() => onCancel(trip.rawId)}
            className="px-3 py-1.5 text-xs bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500 hover:text-white transition-all"
          >
            Cancel Trip
          </button>
        ) : (
          <button
            onClick={() =>
              navigate(`/message/${trip.driver}`, { state: { trip } })
            }
            className="btn-primary"
          >
            Contact Driver
          </button>
        )}
      </div>
    </div>
  );
}

function HomePage() {
  const { privateKey, relays } = useSettings();
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [latestLoading, setLatestLoading] = useState(true);
  const [search, setSearch] = useState({ from: '', to: '', date: '' });
  const [searchResults, setSearchResults] = useState<Trip[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const { toast, show } = useToast();

  useEffect(() => {
    if (!privateKey) return;

    let cancelled = false;
    fetchTrips(relays, privateKey)
      .then((entries) => {
        if (cancelled) return;
        const clean = entries
          .map(eventToTrip)
          .filter((e) => e.from && e.to && e.date);
        setAllTrips(clean);
        setLatestLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLatestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [privateKey, relays]);

  if (!privateKey) return <NoKeyWarning />;

  const myPubKey = asPublicKey(privateKey);
  const myTrips = allTrips.filter((t) => t.driver === myPubKey);
  const latestTrips = allTrips.slice(0, 10);

  const handleCancel = async (eventId: string) => {
    if (!window.confirm('Are you sure you want to cancel this trip?')) return;
    try {
      await deleteEvent(
        relays,
        privateKey,
        eventId,
        'This trip has been cancelled by the driver.'
      );
      show('Trip cancellation broadcasted!', 'success');
      const remove = (list: Trip[]) => list.filter((t) => t.rawId !== eventId);
      setAllTrips(remove);
      setSearchResults((prev) => (prev ? remove(prev) : null));
    } catch (err) {
      show(`Failed to cancel trip. Relays might be offline (${err}).`, 'error');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.from && !search.to && !search.date) return;

    setSearchLoading(true);
    try {
      const entries = await fetchTrips(relays, privateKey);
      const results = entries
        .map(eventToTrip)
        .filter((t) => t.from && t.to && t.date)
        .filter((t) => {
          const matchFrom =
            !search.from ||
            t.from.toLowerCase().includes(search.from.toLowerCase());
          const matchTo =
            !search.to || t.to.toLowerCase().includes(search.to.toLowerCase());
          const matchDate = !search.date || t.date === search.date;
          return matchFrom && matchTo && matchDate;
        });
      setSearchResults(results);
    } catch {
      show('Search failed. Relays might be offline.', 'error');
    } finally {
      setSearchLoading(false);
    }
  };

  const hasSearchInput = search.from || search.to || search.date;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Search */}
      <form
        onSubmit={handleSearch}
        className="bg-card border rounded-xl p-4 shadow-sm space-y-3"
      >
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="search-from">From</FieldLabel>
            <input
              id="search-from"
              className="field"
              placeholder="Paris"
              value={search.from}
              onChange={(e) =>
                setSearch((s) => ({ ...s, from: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="search-to">To</FieldLabel>
            <input
              id="search-to"
              className="field"
              placeholder="Lyon"
              value={search.to}
              onChange={(e) => setSearch((s) => ({ ...s, to: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="search-date">Date</FieldLabel>
            <input
              id="search-date"
              type="date"
              className="field"
              value={search.date}
              onChange={(e) =>
                setSearch((s) => ({ ...s, date: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="btn-primary px-5"
            disabled={searchLoading || !hasSearchInput}
          >
            {searchLoading ? 'Searching…' : 'Search'}
          </button>
          {searchResults !== null && (
            <button
              type="button"
              onClick={() => {
                setSearchResults(null);
                setSearch({ from: '', to: '', date: '' });
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕ Clear
            </button>
          )}
        </div>
      </form>

      {/* Search results */}
      {searchResults !== null && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {searchResults.length === 0
              ? 'No results'
              : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
          </h2>
          {searchResults.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
              No trips match your search.
            </div>
          ) : (
            searchResults.map((trip) => (
              <TripCard
                key={trip.rawId}
                trip={trip}
                myPubKey={myPubKey}
                onCancel={handleCancel}
              />
            ))
          )}
        </section>
      )}

      {/* My trips */}
      {!latestLoading && myTrips.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">My Trips</h2>
          {myTrips.map((trip) => (
            <TripCard
              key={trip.rawId}
              trip={trip}
              myPubKey={myPubKey}
              onCancel={handleCancel}
            />
          ))}
        </section>
      )}

      {/* Latest trips */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground">
          Latest Trips
        </h2>
        {latestLoading ? (
          <LoadingState text="Fetching trips from relays…" />
        ) : latestTrips.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
            No trips yet. Be the first to{' '}
            <Link to="/publish" className="text-primary hover:underline">
              publish one
            </Link>
            !
          </div>
        ) : (
          latestTrips.map((trip) => (
            <TripCard
              key={trip.rawId}
              trip={trip}
              myPubKey={myPubKey}
              onCancel={handleCancel}
            />
          ))
        )}
      </section>

      <Toast toast={toast} />
    </div>
  );
}

function SendDMPage() {
  const { pubkey } = useParams();
  const { state } = useLocation();
  const { privateKey, relays } = useSettings();
  const { toast, show } = useToast();
  const navigate = useNavigate();

  const initialMessage = state?.quote
    ? state.quote
        .split('\n')
        .concat([''])
        .map((line: string) => `> ${line}\n`)
        .join('')
    : '';
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);

  if (!pubkey || pubkey.length !== 64) {
    return <p className="text-muted-foreground">Invalid recipient ID.</p>;
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privateKey || !message.trim()) return;

    setSending(true);
    try {
      await sendDM(relays, privateKey, pubkey, message);
      navigate('/inbox');
    } catch (err) {
      show(`Failed to send message: ${err}`, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-5">
      <h2 className="text-2xl font-bold">Send Message</h2>

      <div className="rounded-xl border bg-card p-4 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
          To
        </p>
        {state?.trip ? (
          <p className="font-medium">
            {state.trip.from} → {state.trip.to}{' '}
            <span className="text-muted-foreground font-normal">
              on {state.trip.date}
            </span>
          </p>
        ) : (
          <p className="font-mono">{pubkey.slice(0, 16)}…</p>
        )}
      </div>

      <form onSubmit={handleSend} className="space-y-3">
        <textarea
          className="field h-40 resize-none"
          placeholder="Hi! I'm interested in this trip. Can you book me a seat?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="btn-primary w-full py-2.5"
        >
          {sending ? 'Sending…' : 'Send Message'}
        </button>
      </form>
      <Toast toast={toast} />
    </div>
  );
}

function PublishPage() {
  const { privateKey, relays } = useSettings();
  const [isPublishing, setIsPublishing] = useState(false);
  const { toast, show } = useToast();

  const emptyForm = {
    from: '',
    to: '',
    date: '',
    time: '',
    info: '',
    seats: '1',
    price: '',
    currency: '',
  };
  const [formData, setFormData] = useState(emptyForm);

  if (!privateKey) return <NoKeyWarning />;

  const set =
    (field: string) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsPublishing(true);
    show('Broadcasting to relays…', 'info');

    try {
      const tripTimestamp = Math.floor(
        new Date(`${formData.date} ${formData.time}`).getTime() / 1000
      );
      const expirationTime = tripTimestamp + 60 * 60 * 2;

      await postTrip(relays, privateKey, formData.info, {
        d: `trip-${crypto.randomUUID()}`,
        expiration: expirationTime.toString(),
        from: formData.from,
        to: formData.to,
        date: formData.date,
        time: formData.time,
        seats: formData.seats,
        price: formData.price,
        currency: formData.currency,
      });
      show('Trip published!', 'success');
      setFormData(emptyForm);
    } catch (error) {
      console.error(error);
      show('Failed to publish. Check your console/relays.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const isInvalid =
    !formData.from || !formData.to || !formData.date || !formData.time;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">Post a Trip</h2>

      <form
        className="space-y-4 bg-card border rounded-xl p-5 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="from">From</FieldLabel>
            <input
              id="from"
              className="field"
              placeholder="Paris"
              value={formData.from}
              onChange={set('from')}
              disabled={isPublishing}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="to">To</FieldLabel>
            <input
              id="to"
              className="field"
              placeholder="Lyon"
              value={formData.to}
              onChange={set('to')}
              disabled={isPublishing}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="date">Date</FieldLabel>
            <input
              id="date"
              type="date"
              className="field"
              value={formData.date}
              onChange={set('date')}
              disabled={isPublishing}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="time">Time</FieldLabel>
            <input
              id="time"
              type="time"
              className="field"
              value={formData.time}
              onChange={set('time')}
              disabled={isPublishing}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="seats">Seats available</FieldLabel>
            <input
              id="seats"
              type="number"
              min="1"
              className="field"
              value={formData.seats}
              onChange={set('seats')}
              disabled={isPublishing}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="price">Price (optional)</FieldLabel>
            <div className="flex gap-2">
              <input
                id="price"
                type="number"
                placeholder="0"
                className="field"
                value={formData.price}
                onChange={set('price')}
                disabled={isPublishing}
              />
              <select
                className="field w-28 shrink-0"
                value={formData.currency}
                onChange={set('currency')}
                disabled={isPublishing}
              >
                <option value="">—</option>
                <option value="SATS">SATS</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
                <option value="CNY">CNY</option>
                <option value="JPY">JPY</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="info">Additional info</FieldLabel>
          <textarea
            id="info"
            placeholder="Luggage space, car model, pets allowed…"
            className="field h-24 resize-none"
            value={formData.info}
            onChange={set('info')}
            disabled={isPublishing}
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full py-2.5"
          disabled={isPublishing || isInvalid}
        >
          {isPublishing ? 'Broadcasting…' : 'Publish Trip'}
        </button>
      </form>

      <Toast toast={toast} />
    </div>
  );
}

function InboxPage() {
  const { privateKey, relays } = useSettings();
  const [messages, setMessages] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast, show } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!privateKey) return;

    let cancelled = false;
    fetchInbox(relays, privateKey)
      .then((data) => {
        if (cancelled) return;
        setMessages(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        show('Failed to load inbox. Relays might be offline.', 'error');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [show, privateKey, relays]);

  if (!privateKey) return <NoKeyWarning />;
  if (loading) return <LoadingState text="Checking your inbox…" />;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">Inbox</h2>

      {messages.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">
          No messages yet.
        </div>
      ) : (
        messages.map((msg) => (
          <div
            key={msg.id}
            className="bg-card border rounded-xl p-4 shadow-sm space-y-3"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground">
                {msg.pubkey.slice(0, 12)}…
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(msg.created_at * 1000).toLocaleString()}
              </span>
            </div>

            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </p>

            <button
              onClick={() =>
                navigate(`/message/${msg.pubkey}`, {
                  state: { quote: msg.content },
                })
              }
              className="btn-primary"
            >
              Reply
            </button>
          </div>
        ))
      )}
      <Toast toast={toast} />
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
    setRelays(newRelays);
  };

  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      {/* Private Key Section */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold border-b pb-2">Identity</h3>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="privkey">Private Key</FieldLabel>
          <p className="text-xs text-muted-foreground">
            Keep this safe — losing it means losing your account.
          </p>
          <input
            id="privkey"
            type="text"
            className="field font-mono"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="Hex private key…"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateKey}
            className="btn-primary"
            disabled={privateKey != ''}
          >
            Generate New Key
          </button>
        </div>
      </section>

      {/* Relays Section */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold border-b pb-2">Relays</h3>
        <div className="space-y-2">
          {relays.map((url, i) => (
            <div key={`${i}-${url}`} className="flex gap-2">
              <input
                className="field"
                value={url}
                onChange={(e) => updateRelay(i, e.target.value)}
                placeholder="wss://relay.example.com"
              />
              <button
                onClick={() =>
                  setRelays(relays.filter((_, index) => index !== i))
                }
                className="px-3 py-2 text-sm text-red-500 border rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setRelays([...relays, ''])}
          className="text-sm text-primary hover:underline"
        >
          + Add Relay
        </button>
      </section>

      {/* Theme Section */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold border-b pb-2">Theme</h3>
        <div className="flex gap-4">
          {(['light', 'dark', 'auto'] as ThemeMode[]).map((t) => (
            <label
              key={t}
              className="flex items-center gap-2 cursor-pointer capitalize text-sm"
            >
              <input
                type="radio"
                name="theme"
                checked={mode === t}
                onChange={() => setMode(t)}
              />
              {t}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
