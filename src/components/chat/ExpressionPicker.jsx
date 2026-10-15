import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Film, Plus, Search, Smile, Sticker as StickerIcon, X } from 'lucide-react';
import { gifsApi, stickersApi } from '../../api/endpoints.js';
import { recentEncryptedGifs } from '../../e2ee/session.js';
import { useChatState } from '../../chat/ChatContext.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { prepareSticker } from '../../utils/image.js';
import { cn } from '../../utils/misc.js';
import { SecureImage } from '../media/SecureMedia.jsx';
import { Sticker } from '../stickers/Sticker.jsx';
import { BLOB_STICKERS, EMOJI_STICKERS } from '../stickers/builtin.js';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';
import { EmojiPicker } from './EmojiPicker.jsx';

const WIDTH = 340;
const HEIGHT = 380;
const TABS = [
  { id: 'emoji', label: 'Emoji', icon: Smile },
  { id: 'gifs', label: 'GIFs', icon: Film },
  { id: 'stickers', label: 'Stickers', icon: StickerIcon },
];

let lastTab = 'emoji'; // reopen where the user left off

/**
 * Emoji, GIFs and stickers in one panel (like WhatsApp). In edit mode only
 * emoji make sense, so `mediaAllowed=false` hides the other tabs.
 *
 * onEmoji(emoji) · onGif(gif) a GIPHY result · onRecentGif(attachment)
 * onSticker(value) a built-in sticker · onMySticker(sticker)
 */
export function ExpressionPicker({ mediaAllowed = true, onEmoji, onGif, onRecentGif, onSticker, onMySticker }) {
  const [tab, setTab] = useState(mediaAllowed ? lastTab : 'emoji');
  const select = (id) => {
    lastTab = id;
    setTab(id);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop" style={{ width: `min(${WIDTH}px, calc(100vw - 1.5rem))` }}>
      <div className="min-h-0" style={{ height: HEIGHT }}>
        {tab === 'emoji' && <EmojiPicker onPick={onEmoji} width="100%" height={HEIGHT} />}
        {tab === 'gifs' && <GifPanel onGif={onGif} onRecentGif={onRecentGif} />}
        {tab === 'stickers' && <StickerPanel onSticker={onSticker} onMySticker={onMySticker} />}
      </div>
      {mediaAllowed && (
        <nav className="flex border-t border-line" role="tablist" aria-label="Emoji, GIFs and stickers">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => select(id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
                tab === id ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-muted',
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// ---------- GIFs ----------

function GifPanel({ onGif, onRecentGif }) {
  const { settings } = useChatState();
  const searchAvailable = Boolean(settings?.gifs?.search);
  const [query, setQuery] = useState('');
  const term = useDebouncedValue(query.trim(), 350);
  const [view, setView] = useState(searchAvailable ? 'search' : 'recent');
  const [results, setResults] = useState({ status: 'idle', gifs: [], nextOffset: null, error: null });
  const [recent, setRecent] = useState({ status: 'loading', gifs: [] });
  const scrollRef = useRef(null);

  const load = useCallback(
    async (offset = 0) => {
      setResults((r) => ({ ...r, status: offset ? 'more' : 'loading', error: null }));
      try {
        const page = term ? await gifsApi.search(term, offset) : await gifsApi.trending(offset);
        setResults((r) => ({ status: 'ready', gifs: offset ? [...r.gifs, ...page.gifs] : page.gifs, nextOffset: page.nextOffset, error: null }));
      } catch (error) {
        setResults((r) => ({ ...r, status: 'error', error: error.message }));
      }
    },
    [term],
  );

  useEffect(() => {
    if (view === 'search' && searchAvailable) load(0);
  }, [view, searchAvailable, load]);

  useEffect(() => {
    Promise.all([gifsApi.recent().then((r) => r.gifs, () => []), recentEncryptedGifs()]).then(([fromServer, onDevice]) => {
      const gifs = [...onDevice, ...fromServer].sort((a, b) => b.id - a.id).slice(0, 30);
      setRecent({ status: 'ready', gifs });
    });
  }, []);

  // Infinite scroll for search/trending.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || results.status !== 'ready' || results.nextOffset == null) return;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 200) load(results.nextOffset);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line p-2">
        {searchAvailable && view === 'search' ? (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIPHY"
              aria-label="Search GIFs"
              maxLength={50}
              autoFocus={window.matchMedia('(pointer: fine)').matches}
              className="h-9 w-full rounded-pill border border-line bg-surface-muted pr-8 pl-8 text-sm text-ink outline-none focus:border-brand-300 focus:bg-surface"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-faint hover:text-ink-muted">
                <X className="size-4" />
              </button>
            )}
          </div>
        ) : (
          <p className="flex-1 px-1 text-sm font-medium text-ink-soft">Recent GIFs</p>
        )}
        {searchAvailable && (
          <button
            type="button"
            onClick={() => setView((v) => (v === 'search' ? 'recent' : 'search'))}
            aria-label={view === 'search' ? 'Show recent GIFs' : 'Search GIFs'}
            title={view === 'search' ? 'Recent' : 'Search'}
            className={cn('rounded-full p-2 hover:bg-surface-muted', view === 'recent' ? 'text-brand-600' : 'text-ink-muted')}
          >
            {view === 'search' ? <Clock className="size-4" /> : <Search className="size-4" />}
          </button>
        )}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5">
        {view === 'recent' || !searchAvailable ? (
          recent.status === 'loading' ? (
            <Centered>
              <Spinner />
            </Centered>
          ) : recent.gifs.length === 0 ? (
            <Centered>
              <Film className="size-8 text-ink-faint" aria-hidden />
              <p>GIFs you send appear here.</p>
              {!searchAvailable && <p className="text-xs">You can also send any .gif file with 📎.</p>}
            </Centered>
          ) : (
            <Grid>
              {recent.gifs.map((gif) => (
                <GifTile key={gif.id} label="Send recent GIF" onClick={() => onRecentGif(gif)} ratio={gif.width && gif.height ? gif.height / gif.width : 0.75}>
                  <SecureImage url={gif.url} className="size-full object-cover" loading="lazy" />
                </GifTile>
              ))}
            </Grid>
          )
        ) : results.status === 'loading' ? (
          <Centered>
            <Spinner />
          </Centered>
        ) : results.status === 'error' && results.gifs.length === 0 ? (
          <Centered>
            <p>{results.error}</p>
            <button type="button" onClick={() => load(0)} className="font-medium text-brand-600 hover:underline">
              Try again
            </button>
          </Centered>
        ) : results.gifs.length === 0 ? (
          <Centered>
            <p>No GIFs found for "{term}".</p>
          </Centered>
        ) : (
          <>
            <Grid>
              {results.gifs.map((gif) => (
                <GifTile key={gif.id} label={`Send GIF: ${gif.title}`} onClick={() => onGif(gif)} ratio={gif.height / gif.width}>
                  {/* Previews come straight from GIPHY; what you send is stored on our server. */}
                  <img src={gif.previewUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" draggable={false} />
                </GifTile>
              ))}
            </Grid>
            {results.status === 'more' && (
              <div className="flex justify-center py-2">
                <Spinner size="sm" />
              </div>
            )}
          </>
        )}
      </div>
      {searchAvailable && view === 'search' && <p className="border-t border-line py-1 text-center text-2xs font-semibold tracking-wide text-ink-faint">Powered by GIPHY</p>}
    </div>
  );
}

/** Two masonry-like columns. */
function Grid({ children }) {
  return <div className="columns-2 gap-1.5 [&>*]:mb-1.5">{children}</div>;
}

function GifTile({ children, label, onClick, ratio }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="block w-full break-inside-avoid overflow-hidden rounded-lg bg-surface-sunken focus-visible:shadow-focus focus-visible:outline-none"
      style={{ aspectRatio: `1 / ${Math.min(Math.max(ratio || 0.75, 0.4), 2)}` }}
    >
      {children}
    </button>
  );
}

function Centered({ children }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-ink-muted">{children}</div>;
}

// ---------- Stickers ----------

const STICKER_SECTIONS = [
  { id: 'mine', label: 'My stickers' },
  { id: 'blob', label: 'TEMU' },
  { id: 'emoji', label: 'Emoji' },
];
let lastStickerSection = 'blob';

function StickerPanel({ onSticker, onMySticker }) {
  const toast = useToast();
  const [section, setSection] = useState(lastStickerSection);
  const [mine, setMine] = useState({ status: 'loading', stickers: [] });
  const [creating, setCreating] = useState(false);
  const fileRef = useRef(null);

  const loadMine = useCallback(() => {
    stickersApi
      .list()
      .then(({ stickers }) => setMine({ status: 'ready', stickers }))
      .catch((error) => setMine({ status: 'error', stickers: [], error: error.message }));
  }, []);
  useEffect(loadMine, [loadMine]);

  const choose = (id) => {
    lastStickerSection = id;
    setSection(id);
  };

  const create = async (file) => {
    if (!file) return;
    setCreating(true);
    try {
      const { blob, width, height } = await prepareSticker(file);
      const { sticker } = await stickersApi.create(blob, { width, height });
      setMine((m) => ({ ...m, stickers: [sticker, ...m.stickers.filter((s) => s.id !== sticker.id)] }));
      toast.show('Sticker created');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCreating(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (sticker) => {
    setMine((m) => ({ ...m, stickers: m.stickers.filter((s) => s.id !== sticker.id) }));
    try {
      await stickersApi.remove(sticker.id);
    } catch (error) {
      toast.error(error.message);
      loadMine();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-line p-2" role="tablist" aria-label="Sticker packs">
        {STICKER_SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => choose(id)}
            className={cn('rounded-full px-3 py-1 text-xs font-medium', section === id ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-soft hover:bg-surface-sunken')}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
        {section === 'blob' && (
          <div className="grid grid-cols-4 gap-1">
            {BLOB_STICKERS.map(({ name, label }) => (
              <StickerTile key={name} label={`Send ${label} sticker`} onClick={() => onSticker(`blob:${name}`)}>
                <Sticker value={`blob:${name}`} size={64} />
              </StickerTile>
            ))}
          </div>
        )}
        {section === 'emoji' && (
          <div className="grid grid-cols-4 gap-1">
            {EMOJI_STICKERS.map((emoji) => (
              <StickerTile key={emoji} label={`Send ${emoji} sticker`} onClick={() => onSticker(`emoji:${emoji}`)}>
                <Sticker value={`emoji:${emoji}`} size={60} />
              </StickerTile>
            ))}
          </div>
        )}
        {section === 'mine' && (
          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={creating}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong text-2xs font-medium text-ink-muted hover:border-brand-400 hover:text-brand-600"
              aria-label="Create a sticker from a photo"
              title="Create a sticker from a photo"
            >
              {creating ? <Spinner size="sm" /> : <Plus className="size-5" aria-hidden />}
              Create
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => create(e.target.files?.[0])} />
            {mine.stickers.map((sticker) => (
              <div key={sticker.id} className="group relative">
                <StickerTile label="Send sticker" onClick={() => onMySticker(sticker)}>
                  <SecureImage url={sticker.url} alt="" className="size-full object-contain" loading="lazy" />
                </StickerTile>
                <button
                  type="button"
                  onClick={() => remove(sticker)}
                  aria-label="Remove sticker"
                  title="Remove sticker"
                  className="absolute -top-1 -right-1 hidden rounded-full bg-surface p-0.5 text-ink-muted shadow-sm ring-1 ring-line group-hover:block hover:text-danger focus-visible:block"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {section === 'mine' && mine.status === 'ready' && mine.stickers.length === 0 && (
          <p className="mt-4 px-2 text-center text-xs text-ink-muted">Make stickers from your photos, or long-press a sticker someone sent and choose "Save sticker".</p>
        )}
      </div>
    </div>
  );
}

function StickerTile({ children, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex aspect-square w-full items-center justify-center rounded-lg p-1 transition-transform hover:scale-110 hover:bg-surface-muted focus-visible:shadow-focus focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
