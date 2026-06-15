/* =====================================================================
   reportes-export.js · Módulo E — Reportes ejecutivos exportables
   Helpers para exportar cualquier tabla a PDF (jsPDF + autotable) o
   Excel (SheetJS). Se cargan por CDN en cada página que los use.
   ===================================================================== */
(function () {
    'use strict';

    function fechaHoy() {
        return new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    // ── PDF con encabezado institucional + tabla ────────────────────
    // opts: { titulo, subtitulo, columnas:[], filas:[[]], nombreArchivo, orientacion }
    window.exportarReportePDF = function (opts) {
        const o = opts || {};
        if (!window.jspdf || !window.jspdf.jsPDF) { alert('No se pudo cargar la librería de PDF (revisa tu conexión).'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: o.orientacion || 'portrait', unit: 'pt', format: 'letter' });
        const ancho = doc.internal.pageSize.getWidth();

        // Banda de encabezado azul institucional
        doc.setFillColor(13, 45, 107);
        doc.rect(0, 0, ancho, 58, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(17); doc.setFont(undefined, 'bold');
        doc.text('SIGEPAV', 40, 26);
        doc.setFontSize(11); doc.setFont(undefined, 'normal');
        doc.text(o.titulo || 'Reporte', 40, 44);

        doc.setTextColor(110);
        doc.setFontSize(9);
        doc.text((o.subtitulo ? o.subtitulo + '  ·  ' : '') + 'Generado el ' + fechaHoy(), 40, 76);

        doc.autoTable({
            startY: 90,
            head: [o.columnas || []],
            body: o.filas || [],
            styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
            headStyles: { fillColor: [13, 45, 107], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [241, 245, 249] },
            margin: { left: 40, right: 40 }
        });

        const total = doc.internal.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i);
            doc.setFontSize(8); doc.setTextColor(150);
            doc.text('SIGEPAV — Sistema de Gestión del Parque Vehicular', 40, doc.internal.pageSize.getHeight() - 20);
            doc.text('Página ' + i + ' de ' + total, ancho - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
        }
        doc.save((o.nombreArchivo || 'reporte') + '.pdf');
    };

    // ── Excel (.xlsx) ───────────────────────────────────────────────
    // opts: { titulo, columnas:[], filas:[[]], nombreArchivo, nombreHoja }
    window.exportarReporteExcel = function (opts) {
        const o = opts || {};
        if (!window.XLSX) { alert('No se pudo cargar la librería de Excel (revisa tu conexión).'); return; }
        const aoa = [
            [o.titulo || 'Reporte'],
            ['Generado el ' + fechaHoy()],
            [],
            o.columnas || [],
            ...(o.filas || [])
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Ancho de columnas automático aproximado
        ws['!cols'] = (o.columnas || []).map((c, i) => {
            const max = Math.max(String(c).length, ...(o.filas || []).map(f => String(f[i] == null ? '' : f[i]).length));
            return { wch: Math.min(Math.max(max + 2, 10), 40) };
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, o.nombreHoja || 'Reporte');
        XLSX.writeFile(wb, (o.nombreArchivo || 'reporte') + '.xlsx');
    };
})();
