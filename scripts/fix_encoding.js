// Corrige el mojibake "doble" (UTF-8 leído como CP850 y reguardado como UTF-8)
// en los campos de texto sembrados por el cliente mysql de Windows.
// Ej: "metió" quedó como "meti├│". Revierte con cp850 -> utf8.
//   node scripts/fix_encoding.js
const path = require('path');
const ROOT = path.join(__dirname, '..');
const mysql = require(path.join(ROOT, 'node_modules', 'mysql2', 'promise'));
const iconv = require(path.join(ROOT, 'node_modules', 'iconv-lite'));
const fs = require('fs');

// Carga credenciales de env.env / .env (igual que Server.js)
for (const nombre of ['env.env', '.env']) {
    const ruta = path.join(ROOT, nombre);
    if (fs.existsSync(ruta)) {
        fs.readFileSync(ruta, 'utf8').split(/\r?\n/).forEach(l => {
            const t = l.trim(); if (!t || t.startsWith('#')) return;
            const i = t.indexOf('='); if (i === -1) return;
            const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
            if (k && process.env[k] === undefined) process.env[k] = v;
        });
    }
}

// Tablas y columnas de texto a revisar.
const OBJETIVO = {
    viajes: ['observaciones', 'motivo', 'descripcion', 'lugar_destino', 'responsable', 'municipio', 'localidad'],
    mantenimiento_observaciones: ['componente', 'descripcion', 'resolucion'],
    mantenimiento_programado: ['componente'],
    vehiculos: ['marca', 'linea', 'color'],
    alertas: ['descripcion'],
};

// Un texto está "roto" si trae caracteres de dibujo de caja / bloques /
// formas geométricas (U+2500–U+25FF), señal típica de este mojibake.
function roto(s) { return typeof s === 'string' && /[─-◿]/.test(s); }
function reparar(s) {
    try {
        const fixed = iconv.encode(s, 'cp850').toString('utf8');
        return roto(fixed) ? s : fixed; // solo si quedó limpio
    } catch (e) { return s; }
}

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'sigepav_user',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sigepav',
        charset: 'utf8mb4'
    });
    let totalCambios = 0;
    for (const [tabla, cols] of Object.entries(OBJETIVO)) {
        const [rows] = await conn.query(`SELECT id, ${cols.join(', ')} FROM ${tabla}`);
        for (const row of rows) {
            const sets = [], vals = [];
            for (const c of cols) {
                if (roto(row[c])) {
                    const fix = reparar(row[c]);
                    if (fix !== row[c]) { sets.push(`${c} = ?`); vals.push(fix); }
                }
            }
            if (sets.length) {
                vals.push(row.id);
                await conn.query(`UPDATE ${tabla} SET ${sets.join(', ')} WHERE id = ?`, vals);
                totalCambios += sets.length;
            }
        }
        console.log(`  - ${tabla}: revisado (${rows.length} filas)`);
    }
    console.log(`OK: ${totalCambios} campo(s) corregido(s).`);
    await conn.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
