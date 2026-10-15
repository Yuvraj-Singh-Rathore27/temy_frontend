/**
 * PDF helpers on top of Mozilla's pdf.js. Loaded on demand (it is large), and
 * configured to never run code from a document: no eval, no scripting, no
 * fetching of external resources.
 */
let loader = null;

function loadPdfJs() {
  loader ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return loader;
}

/** Free a document opened with openPdf (its worker and memory). Safe to call twice or with null. */
export function closePdf(doc) {
  if (!doc) return;
  // pdf.js 6 destroys documents through their loading task.
  Promise.resolve(doc.loadingTask?.destroy?.() ?? doc.destroy?.()).catch(() => {});
}

/** Open a PDF from bytes. Returns pdf.js' document (call closePdf() when done). */
export async function openPdf(data) {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({
    data,
    isEvalSupported: false,
    enableScripting: false,
    disableAutoFetch: true,
    stopAtErrors: false,
  }).promise;
}

/** Draw one page into a canvas at `width` CSS pixels (sharp on high-DPI screens). */
export async function renderPage(doc, pageNumber, canvas, width) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const ratio = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: (width / base.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
  canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
  const task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport });
  await task.promise;
  return { width: base.width, height: base.height, cancel: () => task.cancel() };
}

/**
 * First page as a JPEG preview plus the page count, for sending a PDF.
 * Returns null when the PDF can't be read (encrypted, damaged…): it's then sent without a preview.
 */
export async function pdfPreview(file, width = 480) {
  let doc;
  try {
    doc = await openPdf(new Uint8Array(await file.arrayBuffer()));
    const canvas = document.createElement('canvas');
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; // transparent PDFs would turn black as JPEG
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const thumbnail = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!thumbnail || thumbnail.size > 500 * 1024) return null;
    return { thumbnail, width: canvas.width, height: canvas.height, pageCount: doc.numPages };
  } catch {
    return null;
  } finally {
    closePdf(doc);
  }
}
