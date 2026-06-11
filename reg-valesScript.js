// requireAuth();
try {
    const navUser = document.getElementById('nav-user');
    if (navUser && typeof getSession === 'function') {
        navUser.textContent = getSession()?.email || '';
    }
} catch (e) { /* getSession no disponible */ }
function logout() { try { clearSession(); } catch(e){} location.href='index.html'; }

// FIX (req 6): clic en SIGEPAV vuelve al menú principal
document.addEventListener('click', (e) => {
    const t = e.target.closest('.nav-brand');
    if (!t) return;
    window.location.href = 'index.html';
});
document.querySelectorAll('.nav-brand').forEach(el => {
    el.style.cursor = 'pointer';
    el.title = 'Volver al menú principal';
});
