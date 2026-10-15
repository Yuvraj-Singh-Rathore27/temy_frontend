import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileWarning, Minus, Plus, X } from 'lucide-react';
import { downloadAttachment, fetchAttachmentBlob } from '../../api/files.js';
import { formatBytes } from '../../utils/media.js';
import { closePdf, openPdf, renderPage } from '../../utils/pdf.js';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

/** Can this attachment be opened in the in-app viewer? */
export const isViewableDocument = (attachment) =>
  attachment?.mimeType === 'application/pdf' || attachment?.mimeType === 'text/plain';

/**
 * Full-screen viewer for PDFs (rendered by pdf.js, page by page as you scroll)
 * and plain-text files. Works on phones, which can't show PDFs inline.
 */
export function DocumentViewer({ attachment, onClose }) {
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', progress: 0 });
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const pdf = attachment.mimeType === 'application/pdf';

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    let doc = null;
    (async () => {
      try {
        const blob = await fetchAttachmentBlob(attachment, {
          signal: controller.signal,
          onProgress: (progress) => setState((s) => (s.status === 'loading' ? { ...s, progress } : s)),
        });
        if (pdf) {
          doc = await openPdf(new Uint8Array(await blob.arrayBuffer()));
          if (controller.signal.aborted) return closePdf(doc);
          setState({ status: 'pdf', doc, pages: doc.numPages });
        } else {
          const text = await blob.slice(0, MAX_TEXT_BYTES).text();
          setState({ status: 'text', text, truncated: blob.size > MAX_TEXT_BYTES });
        }
      } catch (error) {
        if (error.name !== 'AbortError') setState({ status: 'error', message: pdf ? 'This PDF could not be opened.' : error.message });
      }
    })();
    return () => {
      controller.abort();
      closePdf(doc);
    };
  }, [attachment, pdf]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadAttachment(attachment);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDownloading(false);
    }
  };

  const zoomBy = (step) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + step))]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900 text-white" role="dialog" aria-modal="true" aria-label={`Document: ${attachment.name}`}>
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{attachment.name}</p>
          <p className="text-xs text-white/60">
            {state.status === 'pdf' ? `${state.pages} ${state.pages === 1 ? 'page' : 'pages'} · ` : ''}
            {formatBytes(attachment.size)}
          </p>
        </div>
        {state.status === 'pdf' && (
          <div className="flex items-center rounded-full bg-white/10">
            <button type="button" onClick={() => zoomBy(-1)} disabled={zoom === ZOOMS[0]} aria-label="Zoom out" className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40">
              <Minus className="size-4" />
            </button>
            <button type="button" onClick={() => setZoom(1)} className="w-12 text-center text-xs tabular-nums" aria-label="Reset zoom">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => zoomBy(1)} disabled={zoom === ZOOMS.at(-1)} aria-label="Zoom in" className="rounded-full p-2 hover:bg-white/10 disabled:opacity-40">
              <Plus className="size-4" />
            </button>
          </div>
        )}
        <button type="button" onClick={download} disabled={downloading} aria-label="Download" className="rounded-full p-2.5 hover:bg-white/10 disabled:opacity-50">
          <Download className="size-5" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2.5 hover:bg-white/10">
          <X className="size-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {state.status === 'loading' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-white/70">
            <Spinner className="text-white" />
            {state.progress > 0 && `${Math.round(state.progress * 100)}%`}
          </div>
        )}
        {state.status === 'error' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/80">
            <FileWarning className="size-10 text-white/60" aria-hidden />
            {state.message}
            <button type="button" onClick={download} className="rounded-full bg-white/15 px-4 py-2 font-medium hover:bg-white/25">
              Download instead
            </button>
          </div>
        )}
        {state.status === 'text' && (
          <pre className="mx-auto max-w-4xl p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-white/90">
            {state.text}
            {state.truncated && '\n\n… (too long to show here: download the file to read the rest)'}
          </pre>
        )}
        {state.status === 'pdf' && <PdfPages doc={state.doc} pages={state.pages} zoom={zoom} />}
      </div>
    </div>,
    document.body,
  );
}

/** All pages, each drawn only once it scrolls near the screen. */
function PdfPages({ doc, pages, zoom }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(() => Math.min(window.innerWidth - 24, 900));
  const [current, setCurrent] = useState(1);

  useEffect(() => {
    const onResize = () => setWidth(Math.min(window.innerWidth - 24, 900));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onVisible = useCallback((pageNumber) => setCurrent(pageNumber), []);

  return (
    <div ref={containerRef} className="relative flex flex-col items-center gap-3 py-3">
      {Array.from({ length: pages }, (_, i) => (
        <PdfPage key={i + 1} doc={doc} pageNumber={i + 1} width={width * zoom} onVisible={onVisible} />
      ))}
      <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs tabular-nums" aria-live="polite">
        {current} / {pages}
      </p>
    </div>
  );
}

function PdfPage({ doc, pageNumber, width, onVisible }) {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const [near, setNear] = useState(pageNumber <= 2);
  const [height, setHeight] = useState(width * 1.414); // A4 until we know better

  useEffect(() => {
    const holder = holderRef.current;
    const nearObserver = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: '600px 0px' });
    const pageObserver = new IntersectionObserver(([entry]) => entry.isIntersecting && onVisible(pageNumber), { threshold: 0.5 });
    nearObserver.observe(holder);
    pageObserver.observe(holder);
    return () => {
      nearObserver.disconnect();
      pageObserver.disconnect();
    };
  }, [pageNumber, onVisible]);

  useEffect(() => {
    if (!near || !canvasRef.current) return undefined;
    let cancel = () => {};
    let alive = true;
    renderPage(doc, pageNumber, canvasRef.current, width)
      .then((page) => {
        cancel = page.cancel;
        if (alive) setHeight((width * page.height) / page.width);
      })
      .catch(() => {});
    return () => {
      alive = false;
      cancel();
    };
  }, [doc, pageNumber, width, near]);

  return (
    <div ref={holderRef} className="shrink-0 bg-white shadow-lg" style={{ width, height }} aria-label={`Page ${pageNumber}`}>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
