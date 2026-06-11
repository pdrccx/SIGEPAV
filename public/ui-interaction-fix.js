/* =====================================================================
   ui-interaction-fix.js · SIGEPAV v14 SAFE
   Reparación mínima de interacción. No captura clicks, no usa intervalos y
   no modifica clases del body. La versión anterior podía dejar la app trabada
   después de tocar un botón en móvil.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__sigepavUiInteractionFixReady) return;
  window.__sigepavUiInteractionFixReady = true;

  function isVisible(el) {
    if (!el) return false;
    var st = window.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0' && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function unlockHiddenOverlays() {
    var loading = document.getElementById('sigepav-loading-overlay');
    if (loading && !loading.classList.contains('activo')) {
      loading.style.pointerEvents = 'none';
      loading.style.visibility = 'hidden';
      loading.style.opacity = '0';
    }

    document.querySelectorAll('.modal-overlay').forEach(function (ov) {
      var hasActiveModal = ov.classList.contains('activo') || /display\s*:\s*block/i.test(ov.getAttribute('style') || '');
      if (!hasActiveModal && !isVisible(ov)) {
        ov.style.pointerEvents = 'none';
      }
    });

    document.querySelectorAll('.dropdown-contenido, .cuenta-panel, #usr-panelNotif, #adm-panelNotif').forEach(function (p) {
      var open = p.classList.contains('show') || p.classList.contains('visible') || /display\s*:\s*block/i.test(p.getAttribute('style') || '');
      p.style.pointerEvents = open ? 'auto' : 'none';
    });
  }

  window.sigepavUnlockUI = unlockHiddenOverlays;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', unlockHiddenOverlays, { once: true });
  } else {
    unlockHiddenOverlays();
  }
  window.addEventListener('pageshow', unlockHiddenOverlays, { passive: true });
})();
