// Worker entry: polyfills must load BEFORE the pdf.js worker code — the worker
// has its own global scope (page polyfills don't apply) and the Catalina engine
// lacks .at()/Object.hasOwn/structuredClone which the transformed worker calls.
import "core-js/actual/array/at";
import "core-js/actual/object/has-own";
import "core-js/actual/structured-clone";
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
