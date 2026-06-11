// Helper global para mostrar/ocultar el loading overlay
window.sigepavLoading = {
  show: function(msg) {
    var el = document.getElementById('sigepav-loading-overlay');
    var txt = document.getElementById('sigepav-loading-msg');
    if (txt) txt.textContent = msg || 'Procesando...';
    if (el) el.classList.add('activo');
  },
  hide: function() {
    var el = document.getElementById('sigepav-loading-overlay');
    if (el) el.classList.remove('activo');
  }
};
