/**
 * VOLPER SEAL S.A.C. - Módulo de Generación y Vista Previa de Guía de Cotización en PDF
 * Utiliza jsPDF nativo y jspdf-autotable para renderizar texto vectorial real 100% seleccionable.
 * Desarrollado por GoldenSystem.pe
 */

window.generarCotizacionPDF = function (data) {
    window.showToast("Generando documento digital...", "info");

    const { jsPDF } = window.jspdf;

    // Inicializar jsPDF en formato A4 vertical con medidas en milímetros (210mm x 297mm)
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    // 1. --- LOGOTIPO DE LA EMPRESA ---
    const logoImg = document.getElementById('companyLogo');
    if (logoImg && logoImg.complete && logoImg.naturalWidth !== 0) {
        // Dibujar el logo real de la carpeta assets
        doc.addImage(logoImg, 'PNG', 15, 15, 20, 20);
    } else {
        // Fallback: Dibujar logotipo vectorial si el PNG no se cargó correctamente
        // Círculos concéntricos verdes (#22c55e)
        doc.setDrawColor(34, 197, 94);
        doc.setLineWidth(1.0);
        doc.circle(28, 25, 9, 'S'); // Radio 9
        doc.circle(28, 25, 6, 'S'); // Radio 6

        // Líneas del engranaje interior (Letra K)
        doc.setLineWidth(2.2);
        doc.line(25.5, 19, 25.5, 31);    // Línea vertical
        doc.line(25.5, 25, 30.5, 19);    // Diagonal superior
        doc.line(25.5, 25, 30.5, 31);    // Diagonal inferior
    }

    // 2. --- TEXTO DE LA EMPRESA ---
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(26, 54, 93); // #1a365d (Azul oscuro premium)
    doc.text("VOLPER SEAL S.A.C.", 40, 20);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(74, 85, 104); // #4a5568
    const companyLines = [
        "URB. ALAMEDA DE HUACHIPA CAL. A MZ F LT 4 ,",
        "LURIGANCHO , LIMA - LIMA",
        "Email: volperseal@gmail.com",
        "REF: PARADERO TUMI"
    ];
    doc.text(companyLines.join("\n"), 40, 24.5);

    // 3. --- RECUADRO DE RUC / NÚMERO DE COTIZACIÓN ---
    doc.setDrawColor(45, 55, 72); // #2d3748
    doc.setLineWidth(0.5);
    doc.rect(138, 12, 57, 23, 'S');

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(45, 55, 72);
    doc.text("RUC 20554367039", 166.5, 18, { align: "center" });

    doc.setFontSize(11);
    doc.setTextColor(26, 54, 93); // Azul
    doc.text("COTIZACIÓN", 166.5, 24, { align: "center" });

    doc.setFontSize(10.5);
    doc.setTextColor(229, 62, 62); // Rojo
    doc.text(data.number || 'COT-XXXX', 166.5, 31, { align: "center" });

    // 4. --- TABLA DE DATOS DEL CLIENTE (MÁXIMA ALINEACIÓN) ---
    const fechaEmision = data.date || '';
    const horaEmision = data.time || '12:00:00';

    doc.autoTable({
        startY: 40,
        margin: { left: 15, right: 15 },
        theme: 'plain',
        styles: {
            fontSize: 8,
            cellPadding: 0.5,
            textColor: [45, 55, 72],
            font: 'Helvetica'
        },
        columnStyles: {
            0: { cellWidth: 20, fontStyle: 'bold' },
            1: { cellWidth: 80 },
            2: { cellWidth: 32, fontStyle: 'bold' },
            3: { cellWidth: 48 }
        },
        body: [
            ["Cliente", `: ${data.customerName}`, "Fecha de Emisión", `: ${fechaEmision}`],
            ["RUC", `: ${data.customerRuc || '-'}`, "Hora de Emisión", `: ${horaEmision}`],
            ["Dirección", `: ${data.address || '-'}`, "", ""],
            ["T. Pago", ": Contado", "", ""],
            ["Vendedor", `: ${data.sellerName || 'Ventas'}`, "", ""],
            ["Observación", `: ${data.description || '-'}`, "", ""]
        ]
    });

    // Dibujar línea divisora horizontal
    const dividerY = doc.lastAutoTable.finalY + 1.5;
    doc.setDrawColor(113, 128, 150); // #718096
    doc.setLineWidth(0.2);
    doc.line(15, dividerY, 195, dividerY);

    // 5. --- TABLA DE ÍTEMS CON AUTO-PAGINACIÓN ---
    const tableBody = data.items.map(item => [
        item.quantity.toString(),
        "NIU",
        item.description,
        "" // Celda vacía para rellenado manual
    ]);

    doc.autoTable({
        startY: dividerY + 1.5,
        margin: { left: 15, right: 15 },
        head: [["CAN", "UNI", "PRODUCTO", "OBSERVACIÓN / FALTANTE"]],
        body: tableBody,
        theme: 'striped',
        headStyles: {
            fillColor: [26, 54, 93], // Azul oscuro premium
            textColor: [255, 255, 255],
            fontSize: 9,
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 12, halign: 'center' },
            2: { cellWidth: 94, halign: 'left' },
            3: { cellWidth: 60, halign: 'center' }
        },
        styles: {
            fontSize: 8.5,
            cellPadding: 1.2,
            textColor: [45, 55, 72],
            valign: 'middle'
        },
        alternateRowStyles: {
            fillColor: [247, 250, 252] // Sombreado alterno suave
        },
        didDrawCell: function (data) {
            // Dibujar una línea horizontal separadora en la parte inferior de cada celda
            const doc = data.doc;
            doc.setDrawColor(180, 180, 180); // Gris medio suave para guiar la escritura
            doc.setLineWidth(0.1);
            doc.line(
                data.cell.x,
                data.cell.y + data.cell.height,
                data.cell.x + data.cell.width,
                data.cell.y + data.cell.height
            );
        }
    });

    // 6. --- PIE DE PÁGINA (MARCA DE AGUA Y NUMERACIÓN EN CADA HOJA) ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        // Línea divisora del footer
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.25);
        doc.line(15, 282, 195, 282);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(113, 128, 150);
        doc.text("Elaborado por GoldenSystem.pe", 105, 287, { align: "center" });

        // Paginación dinámica "Página X de Y"
        doc.text(`Página ${i} de ${totalPages}`, 195, 287, { align: "right" });
    }

    // 7. --- CARGAR EN EL PREVISUALIZADOR NATIVO DEL NAVEGADOR ---
    try {
        const pdfBlob = doc.output('blob');
        const blobUrl = URL.createObjectURL(pdfBlob);

        // Actualizar el Iframe de la vista previa nativa (Gandalf Style)
        const iframe = document.getElementById('pdfPreviewIframe');
        if (iframe) {
            iframe.src = blobUrl;
        }

        // Configurar el botón "Descargar PDF" para guardar el archivo localmente
        document.getElementById('btnDownloadPdfActual').onclick = () => {
            doc.save(`${data.number}_GUIA.pdf`);
            window.showToast("¡PDF descargado con éxito!", "success");
        };

        // Configurar cierre del modal
        $('.close-modal-preview').off('click').on('click', function () {
            if (iframe) iframe.src = 'about:blank'; // Limpiar iframe para liberar memoria
            $('#modalPdfPreview').fadeOut();
        });

        // Mostrar el modal flotante
        $('#modalPdfPreview').fadeIn();
        window.showToast("Vista previa cargada con éxito.", "success");

    } catch (err) {
        console.error("Error al cargar la previsualización del PDF:", err);
        window.showToast("Error al previsualizar el PDF.", "error");
    }
};
