document.addEventListener('DOMContentLoaded', async () => {

    // Helper para alertas flotantes (Toast Notifications)
    window.showToast = function (message, type = 'success') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;

        let icon = "🔔";
        if (type === 'success') icon = "✅";
        else if (type === 'error') icon = "❌";
        else if (type === 'warning') icon = "⚠️";
        else if (type === 'info') icon = "⏳";

        toast.innerHTML = `<span style="font-size: 1.2rem;">${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                toast.remove();
            }, 400);
        }, 4000);
    };

    // --- AUTHENTICATION ---
    const token = localStorage.getItem('volper_token');

    // Helper para fetch
    window.fetchWithAuth = async function (url, options = {}) {
        options.headers = options.headers || {};
        return fetch(url, options);
    };

    window.warehouseAliasesByName = {};
    window.warehouseAliasesById = {};

    async function cargarDiccionarioAlmacenes() {
        try {
            const res = await fetchWithAuth('/api/warehouses');
            if (res.ok) {
                const data = await res.json();

                const filterWH = document.getElementById('filterWarehouse');
                const filterMovWH = document.getElementById('filterMovimientosWarehouse');
                const trasTargetWH = document.getElementById('trasTargetWarehouse');
                
                if (filterWH) filterWH.innerHTML = '<option value="all">Todos los almacenes</option>';
                if (filterMovWH) filterMovWH.innerHTML = '<option value="all">Todos los almacenes</option>';
                if (trasTargetWH) trasTargetWH.innerHTML = '<option value="">-- Seleccionar --</option>';

                data.forEach(wh => {
                    window.warehouseAliasesByName[wh.name] = wh.alias;
                    window.warehouseAliasesById[wh.id] = wh.alias;

                    if (filterWH) filterWH.insertAdjacentHTML('beforeend', `<option value="${wh.alias}">${wh.alias}</option>`);
                    if (filterMovWH) filterMovWH.insertAdjacentHTML('beforeend', `<option value="${wh.alias}">${wh.alias}</option>`);
                    if (trasTargetWH) trasTargetWH.insertAdjacentHTML('beforeend', `<option value="${wh.id}">${wh.alias}</option>`);
                });
            }
        } catch (e) {
            console.error("Error cargando almacenes", e);
        }
    }

    // --- SYSTEM INITIALIZATION ---
    async function inicializarApp() {
        // Ocultar login por completo
        const loginContainer = document.getElementById('login-container');
        if (loginContainer) loginContainer.style.display = 'none';

        const appContainer = document.getElementById('app-container');
        if (appContainer) appContainer.style.display = 'contents'; // Mantiene el layout flex de body

        // Verificar si las credenciales de Volper están configuradas
        try {
            const res = await fetch('/api/config/credentials');
            if (res.ok) {
                const config = await res.json();
                const alertBanner = document.getElementById('missing-config-alert');

                if (config.configured) {
                    if (alertBanner) alertBanner.style.display = 'none';
                } else {
                    if (alertBanner) alertBanner.style.display = 'flex';
                }

                // Cargar valores guardados en los inputs de configuración
                document.getElementById('configVentasEmail').value = config.ventasEmail || "";
                document.getElementById('configVentasPassword').value = config.ventasPassword || "";
                document.getElementById('configAlmacenEmail').value = config.almacenEmail || "";
                document.getElementById('configAlmacenPassword').value = config.almacenPassword || "";
            }
        } catch (e) {
            console.error("Error al obtener la configuración de credenciales", e);
        }

        // Inicializar tablas solo si no se han inicializado
        if (!window.tablasInicializadas) {
            await cargarDiccionarioAlmacenes();
            inicializarTablas();
            cargarHistorial();
            window.tablasInicializadas = true;
        }

        // Adjust DataTables headers after rendering
        setTimeout(() => {
            $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
        }, 150);
    }

    // Iniciar de inmediato
    inicializarApp();

    // Actualizar Kardex
    $(document).on('click', '#btnRefreshKardex', function () {
        const btn = $(this);
        btn.prop('disabled', true).text('⏳ Actualizando...');
        if (window.tableKardex) {
            window.tableKardex.ajax.reload(function () {
                btn.prop('disabled', false).text('🔄 Actualizar Kardex');
                window.showToast("Kardex actualizado", "success");
            });
        }
    });

    // Evento de submit para guardar la configuración de credenciales
    $(document).on('submit', '#formConfigCredentials', async function (e) {
        e.preventDefault();
        const ventasEmail = document.getElementById('configVentasEmail').value;
        const ventasPassword = document.getElementById('configVentasPassword').value;
        const almacenEmail = document.getElementById('configAlmacenEmail').value;
        const almacenPassword = document.getElementById('configAlmacenPassword').value;

        const btn = document.getElementById('btnSaveConfig');
        btn.disabled = true;
        btn.innerText = "Guardando...";

        try {
            const res = await fetch('/api/config/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ventasEmail,
                    ventasPassword,
                    almacenEmail,
                    almacenPassword
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast("Configuración guardada exitosamente.");

                // Ocultar banner de alerta si todo está lleno
                const alertBanner = document.getElementById('missing-config-alert');
                if (ventasEmail && ventasPassword && almacenEmail && almacenPassword) {
                    if (alertBanner) alertBanner.style.display = 'none';
                }

                // Intentar sincronizar catálogo para probar
                showToast("Probando conexión con Volper...", "info");
                fetch('/api/update-catalog');
            } else {
                showToast(data.error || "Error al guardar configuración.", "error");
            }
        } catch (e) {
            showToast("Error de conexión al guardar configuración.", "error");
        } finally {
            btn.disabled = false;
            btn.innerText = "💾 Guardar Configuración";
        }
    });

    // Click en botón del banner "Configurar ahora"
    $(document).on('click', '.btn-go-to-config', function () {
        const configLink = document.querySelector('.nav-link[data-target="view-config"]');
        if (configLink) {
            configLink.click();
        }
    });


    // --- NAVEGACIÓN Y RESPONSIVE ---
    const navLinks = document.querySelectorAll('.nav-link:not(#btnLogout)');
    const viewSections = document.querySelectorAll('.view-section');
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarPin = document.getElementById('sidebar-pin');

    // Cargar estado inicial del pin de manera persistente
    const isPinned = localStorage.getItem('sidebar_pinned') === 'true';
    if (isPinned) {
        document.body.classList.add('sidebar-pinned');
    }

    if (sidebarPin) {
        sidebarPin.addEventListener('click', (e) => {
            e.stopPropagation();
            const nowPinned = document.body.classList.toggle('sidebar-pinned');
            localStorage.setItem('sidebar_pinned', nowPinned);

            // Reajustar anchos de las tablas de DataTables una vez termine la transición CSS de 300ms
            setTimeout(() => {
                if ($.fn.dataTable) {
                    $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
                }
            }, 350);

            window.showToast(nowPinned ? "Menú lateral fijado." : "Menú lateral comprimido.", "info");
        });
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            // Scroll al inicio para evitar que compartan la posición del scroll
            window.scrollTo({ top: 0, behavior: 'instant' });

            // Remover active de todos
            navLinks.forEach(l => l.classList.remove('active'));
            viewSections.forEach(v => v.classList.remove('active'));

            // Añadir active al clickeado
            link.classList.add('active');
            const targetId = link.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');

            // Ajustar el ancho de las columnas de DataTables al cambiar de pestaña
            setTimeout(() => {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 100);

            // En móvil, cerrar el sidebar al hacer click en una opción
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
            }
        });
    });

    let table, tableMovimientos, tableWarehouses, tableCatalog, tableQuotations;
    window.tableKardex = null;

    // Agregar función de filtrado para Cotizaciones por Cliente
    $.fn.dataTable.ext.search.push(
        function (settings, data, dataIndex, rowData, counter) {
            if (settings.nTable.id !== 'customerQuotationsTable') return true;

            const customerFilter = $('#filterCustQuotCustomer').val();
            const customerVal = rowData ? rowData.customer_name : (data[0] || "");

            let passCustomer = true;
            if (customerFilter && customerFilter !== 'all') {
                passCustomer = (customerVal.toLowerCase() === customerFilter.toLowerCase());
            }

            return passCustomer;
        }
    );

    // Agregar función de filtrado personalizada para Inventario
    $.fn.dataTable.ext.search.push(
        function (settings, data, dataIndex, rowData, counter) {
            if (settings.nTable.id !== 'productsTable') return true;

            const whFilter = $('#filterWarehouse').val();
            const stockFilter = $('#filterStock').val();

            let resolvedAlias = "";
            if (rowData && rowData.warehouse_name) {
                resolvedAlias = window.warehouseAliasesByName[rowData.warehouse_name] ||
                    (rowData.warehouse_name.includes(' - ') ? rowData.warehouse_name.split(' - ')[1].trim() : rowData.warehouse_name);
            }

            let passWarehouse = true;
            if (whFilter && whFilter !== 'all') {
                passWarehouse = (resolvedAlias === whFilter);
            }

            const stockValue = parseFloat(rowData.stock) || 0;
            let passStock = true;

            if (stockFilter === '>0') passStock = (stockValue > 0);
            else if (stockFilter === '<0') passStock = (stockValue < 0);
            else if (stockFilter === '!=0') passStock = (stockValue !== 0);
            else if (stockFilter === '=0') passStock = (stockValue === 0);

            return passWarehouse && passStock;
        }
    );

    // Agregar función de filtrado personalizada para Movimientos
    $.fn.dataTable.ext.search.push(
        function (settings, data, dataIndex, rowData, counter) {
            if (settings.nTable.id !== 'movimientosTable') return true;

            const whFilter = $('#filterMovimientosWarehouse').val();
            const stockFilter = $('#filterMovimientosStock').val();

            let resolvedAlias = "";
            if (rowData && rowData.warehouse_description) {
                resolvedAlias = window.warehouseAliasesById[rowData.warehouse_id] ||
                    (rowData.warehouse_description.includes(' - ') ? rowData.warehouse_description.split(' - ')[1].trim() : rowData.warehouse_description);
            }

            let passWarehouse = true;
            if (whFilter && whFilter !== 'all') {
                passWarehouse = (resolvedAlias === whFilter);
            }

            const stockValue = parseFloat(rowData.stock) || 0;
            let passStock = true;

            if (stockFilter === '>0') passStock = (stockValue > 0);
            else if (stockFilter === '<0') passStock = (stockValue < 0);
            else if (stockFilter === '!=0') passStock = (stockValue !== 0);
            else if (stockFilter === '=0') passStock = (stockValue === 0);

            return passWarehouse && passStock;
        }
    );

    // Agregar función de filtrado para Cotizaciones
    $.fn.dataTable.ext.search.push(
        function (settings, data, dataIndex, rowData, counter) {
            if (settings.nTable.id !== 'quotationsTable') return true;

            const statusFilter = $('#filterQuotationStatus').val();
            const customerFilter = $('#filterQuotationCustomer').val();

            const statusVal = rowData ? rowData.status : (data[3] || "");
            const customerVal = rowData ? rowData.customerName : (data[2] || "");

            let passStatus = true;
            if (statusFilter && statusFilter !== 'all') {
                passStatus = (statusVal === statusFilter);
            }

            let passCustomer = true;
            if (customerFilter && customerFilter !== 'all') {
                passCustomer = (customerVal === customerFilter);
            }

            return passStatus && passCustomer;
        }
    );

    function inicializarTablas() {
        // Eventos para redibujar la tabla al cambiar filtros
        $('#filterWarehouse, #filterStock').on('change', function () {
            if (table) table.draw();
        });

        $('#filterMovimientosWarehouse, #filterMovimientosStock').on('change', function () {
            if (tableMovimientos) tableMovimientos.draw();
        });

        $('#filterQuotationStatus, #filterQuotationCustomer').on('change', function () {
            if (tableQuotations) tableQuotations.draw();
        });

        // --- INVENTARIO ---
        table = $('#productsTable').DataTable({
            ajax: {
                url: '/api/products',
                dataSrc: '',
                beforeSend: function (request) {
                    const tk = localStorage.getItem('volper_token');
                    if (tk) request.setRequestHeader("Authorization", "Bearer " + tk);
                },
                error: function (xhr, error, code) {
                    if (xhr.status === 401) cerrarSesion("Sesión expirada");
                }
            },
            columns: [
                { data: 'internal_id', defaultContent: '' },
                { data: 'name', defaultContent: '' },
                { data: 'item_category_name', defaultContent: 'Sin Categoría' },
                { data: 'stock', defaultContent: '0' },
                {
                    data: 'reserva',
                    defaultContent: '0',
                    render: function (data) {
                        return `<span style="color: ${data > 0 ? '#e74c3c' : '#a0aec0'}; font-weight: bold;">${data}</span>`;
                    }
                },
                {
                    data: 'stockDiferencia',
                    defaultContent: '0',
                    render: function (data) {
                        return `<span style="color: ${data > 0 ? '#2ecc71' : (data < 0 ? '#e74c3c' : '#f39c12')}; font-weight: bold;">${data}</span>`;
                    }
                },
                {
                    data: 'warehouse_name',
                    defaultContent: '',
                    render: function (data) {
                        if (!data) return '';
                        return window.warehouseAliasesByName[data] || (data.includes(' - ') ? data.split(' - ')[1].trim() : data);
                    }
                }
            ],
            language: {
                search: "Buscar:",
                lengthMenu: "Mostrar _MENU_ registros",
                info: "Mostrando _START_ a _END_ de _TOTAL_ entradas",
                paginate: {
                    first: "Primero",
                    last: "Último",
                    next: "Siguiente",
                    previous: "Anterior"
                },
                loadingRecords: "Cargando productos...",
                zeroRecords: "No se encontraron resultados",
                emptyTable: "No hay datos disponibles en la tabla"
            },
            stateSave: true,
            pageLength: 20,
            lengthMenu: [20, 50, 100],
            scrollX: true // Para ayudar en móvil con la tabla de datatables
        });

        // --- MOVIMIENTOS ---
        tableMovimientos = $('#movimientosTable').DataTable({
            ajax: {
                url: '/api/movimientos',
                dataSrc: '',
                beforeSend: function (request) {
                    const tk = localStorage.getItem('volper_token');
                    if (tk) request.setRequestHeader("Authorization", "Bearer " + tk);
                },
                error: function (xhr, error, code) {
                    if (xhr.status === 401) cerrarSesion("Sesión expirada");
                }
            },
            columns: [
                {
                    data: null,
                    render: function (data, type, row, meta) {
                        return meta.row + 1; // Enumeración de tabla
                    }
                },
                { data: 'item_id' },
                { data: 'item_internal_id' },
                { data: 'item_description' },
                {
                    data: 'warehouse_description',
                    render: function (data, type, row) {
                        if (!data) return '';
                        return window.warehouseAliasesById[row.warehouse_id] || (data.includes(' - ') ? data.split(' - ')[1].trim() : data);
                    }
                },
                { data: 'stock' },
                {
                    data: null,
                    render: function (data, type, row) {
                        return `<div style="display:flex;gap:5px;">
                                <button class="btn btn-primary btn-ingreso" style="padding: 5px 10px; font-size: 0.8rem;" 
                                data-item_id="${row.item_id}" 
                                data-item_code="${row.item_internal_id}" 
                                data-item_desc="${row.item_description}" 
                                data-wh_id="${row.warehouse_id}" 
                                data-wh_desc="${row.warehouse_description}">➕ Ingreso</button>
                                <button class="btn btn-secondary btn-traslado" style="padding: 5px 10px; font-size: 0.8rem; background-color:#6c757d; border:none; color:white;" 
                                data-item_id="${row.item_id}" 
                                data-item_code="${row.item_internal_id}" 
                                data-item_desc="${row.item_description}" 
                                data-wh_id="${row.warehouse_id}" 
                                data-wh_desc="${row.warehouse_description}"
                                data-stock="${row.stock}">🔄 Traslado</button></div>`;
                    }
                }
            ],
            language: {
                search: "Buscar:",
                lengthMenu: "Mostrar _MENU_ registros",
                info: "Mostrando _START_ a _END_ de _TOTAL_ entradas",
                paginate: {
                    first: "Primero",
                    last: "Último",
                    next: "Siguiente",
                    previous: "Anterior"
                },
                loadingRecords: "Cargando movimientos...",
                zeroRecords: "No se encontraron resultados",
                emptyTable: "Aún no hay datos de movimientos"
            },
            stateSave: true,
            pageLength: 20,
            lengthMenu: [20, 50, 100],
            scrollX: true
        });

        // --- KARDEX DE INGRESOS ---
        window.tableKardex = $('#kardexTable').DataTable({
            ajax: {
                url: '/api/kardex',
                dataSrc: ''
            },
            columns: [
                { data: 'date', defaultContent: '' },
                { data: 'item_code', defaultContent: '' },
                { data: 'item_description', defaultContent: '' },
                { data: 'warehouse_description', defaultContent: '' },
                { data: 'initial_stock', defaultContent: '0' },
                { 
                    data: 'added_quantity', 
                    defaultContent: '0', 
                    render: function(d) { return `<span style="color:#2ecc71;font-weight:bold;">+${d}</span>`; } 
                },
                { data: 'final_stock', defaultContent: '0' },
                { data: 'comments', defaultContent: '' }
            ],
            language: {
                search: "Buscar:",
                lengthMenu: "Mostrar _MENU_ registros",
                info: "Mostrando _START_ a _END_ de _TOTAL_ entradas",
                paginate: { first: "Primero", last: "Último", next: "Siguiente", previous: "Anterior" },
                loadingRecords: "Cargando kardex...",
                zeroRecords: "No hay movimientos registrados",
                emptyTable: "Aún no hay ingresos locales en el kardex"
            },
            order: [[0, 'desc']],
            dom: 'Bfrtip',
            buttons: [
                {
                    extend: 'excelHtml5',
                    text: '📥 Exportar a Excel',
                    className: 'btn btn-success btn-dt-export',
                    title: 'Kardex de Ingresos Volper'
                },
                {
                    extend: 'print',
                    text: '🖨️ Imprimir',
                    className: 'btn btn-primary btn-dt-export',
                    title: 'Kardex de Ingresos Volper'
                }
            ],
            pageLength: 20,
            scrollX: true
        });

        // --- ALMACENES ---
        tableWarehouses = $('#warehousesTable').DataTable({
            ajax: {
                url: '/api/warehouses',
                dataSrc: '',
                beforeSend: function (request) {
                    const tk = localStorage.getItem('volper_token');
                    if (tk) request.setRequestHeader("Authorization", "Bearer " + tk);
                },
                error: function (xhr, error, code) {
                    if (xhr.status === 401) cerrarSesion("Sesión expirada");
                }
            },
            columns: [
                { data: 'id' },
                { data: 'name' },
                { data: 'alias' },
                { data: 'itemCount' },
                {
                    data: null,
                    render: function (data, type, row) {
                        return `<button class="btn btn-primary btn-edit-alias" style="padding: 5px 10px; font-size: 0.8rem;" 
                                data-id="${row.id}" 
                                data-alias="${row.alias || ''}">✏️ Editar Alias</button>`;
                    }
                }
            ],
            language: {
                search: "Buscar:",
                lengthMenu: "Mostrar _MENU_ registros",
                info: "Mostrando _START_ a _END_ de _TOTAL_ entradas",
                paginate: {
                    first: "Primero",
                    last: "Último",
                    next: "Siguiente",
                    previous: "Anterior"
                },
                emptyTable: "No hay datos disponibles en la tabla"
            },
            stateSave: true
        });

        // Event listener para editar alias
        $(document).on('click', '.btn-edit-alias', async function () {
            const id = $(this).data('id');
            const currentAlias = $(this).data('alias');

            const newAlias = prompt("Introduce el nuevo alias para este almacén:", currentAlias);
            if (newAlias !== null && newAlias.trim() !== "") {
                try {
                    const res = await fetchWithAuth(`/api/warehouses/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ alias: newAlias.trim() })
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                        await cargarDiccionarioAlmacenes(); // Actualizar diccionario
                        tableWarehouses.ajax.reload(null, false);
                        table.ajax.reload(null, false); // Recargar Inventario
                        tableMovimientos.ajax.reload(null, false); // Recargar Movimientos
                    } else {
                        alert("Error al actualizar: " + data.error);
                    }
                } catch (e) {
                    alert("Error de conexión al guardar el alias.");
                }
            }
        });

        // --- CATÁLOGO ---
        tableCatalog = $('#catalogTable').DataTable({
            ajax: {
                url: '/api/catalog',
                dataSrc: '',
                beforeSend: function (request) {
                    const tk = localStorage.getItem('volper_token');
                    if (tk) request.setRequestHeader("Authorization", "Bearer " + tk);
                }
            },
            columns: [
                { data: 'internal_id', defaultContent: '' },
                { data: 'name', defaultContent: '' },
                {
                    data: 'originWarehouse',
                    defaultContent: '<span style="color:#a0aec0; font-style:italic;">Automático (Por Stock)</span>',
                    render: function (data) {
                        if (!data) return '<span style="color:#a0aec0; font-style:italic;">Automático (Por Stock)</span>';
                        return `<strong>${data}</strong>`;
                    }
                },
                {
                    data: null,
                    render: function (data, type, row) {
                        return `<button class="btn btn-secondary btn-sm btn-edit-origin" data-id="${row.internal_id}" data-current="${row.originWarehouse || ''}">✏️ Asignar Origen</button>`;
                    }
                }
            ],
            language: {
                search: "Buscar Producto:",
                paginate: { first: "Primero", last: "Último", next: "Siguiente", previous: "Anterior" }
            },
            stateSave: true
        });

        // Event listener para editar origen
        $(document).on('click', '.btn-edit-origin', async function () {
            const internal_id = $(this).data('id');
            const currentOrigin = $(this).data('current');

            let promptText = "Ingresa el ALIAS del almacén (Ej: Ventas, 2do Piso). Déjalo en blanco para volver al modo automático.";
            const newOrigin = prompt(promptText, currentOrigin);

            if (newOrigin !== null) {
                try {
                    const res = await fetchWithAuth(`/api/catalog/${internal_id}/origin`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ originWarehouse: newOrigin.trim() === "" ? null : newOrigin.trim() })
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                        tableCatalog.ajax.reload(null, false);
                        if (table) table.ajax.reload(null, false); // Reload Inventario to apply new reservation logic
                    } else {
                        alert("Error al actualizar: " + (data.error || ""));
                    }
                } catch (e) {
                    alert("Error de conexión al guardar.");
                }
            }
        });

        // --- HISTORIAL DE COTIZACIONES ---
        tableQuotations = $('#quotationsTable').DataTable({
            ajax: {
                url: '/api/quotations',
                dataSrc: function (json) {
                    // Actualizar el select de clientes dinámicamente
                    const customerSelect = $('#filterQuotationCustomer');
                    const currentValue = customerSelect.val();
                    customerSelect.html('<option value="all">Todos los clientes</option>');

                    const uniqueCustomers = [...new Set(json.map(q => q.customerName))].sort();
                    uniqueCustomers.forEach(c => {
                        if (c) customerSelect.append(`<option value="${c}">${c}</option>`);
                    });

                    if (uniqueCustomers.includes(currentValue)) {
                        customerSelect.val(currentValue);
                    } else {
                        customerSelect.val('all');
                    }
                    return json;
                },
                beforeSend: function (request) {
                    const tk = localStorage.getItem('volper_token');
                    if (tk) request.setRequestHeader("Authorization", "Bearer " + tk);
                }
            },
            columns: [
                { data: 'number', render: data => `<strong>${data}</strong>` },
                { data: 'date' },
                { data: 'customerName', render: data => `<div class="customer-name-cell" title="${data}">${data}</div>` },
                {
                    data: 'status',
                    render: function (data) {
                        let badgeClass = 'badge-secondary';
                        if (data === 'RESERVADO') badgeClass = 'badge-warning';
                        if (data === 'FACTURADO') badgeClass = 'badge-success';
                        return `<span class="badge ${badgeClass}">${data}</span>`;
                    }
                },
                {
                    data: 'documentRef',
                    render: function (data) {
                        return `<strong style="color: #6c757d;">${data || '-'}</strong>`;
                    }
                },
                {
                    data: null,
                    render: function (data, type, row) {
                        const selectHtml = row.status === 'FACTURADO' ?
                            `<span style="display:inline-block; margin-left: 5px; font-size: 0.8rem; color: #aaa;">✔ Completado</span>` :
                            `<select onchange="cambiarEstadoCotizacion('${row.id}', this.value)" class="form-control" style="display:inline-block; width:auto; padding: 2px; font-size: 0.8rem; margin-left: 5px;">
                                <option value="" disabled selected>Cambiar Estado...</option>
                                <option value="PENDIENTE">Marcar Pendiente</option>
                                <option value="RESERVADO">Marcar Reservado</option>
                                <option value="FACTURADO">Marcar Facturado</option>
                            </select>`;
                        return `
                            <button onclick="verCotizacion('${row.number}')" class="btn btn-primary btn-sm" style="padding: 4px 8px; font-size: 0.8rem;">
                                🔍 Ver Detalle
                            </button>
                            ${selectHtml}
                        `;
                    }
                }
            ],
            language: {
                search: "Buscar:",
                lengthMenu: "Mostrar _MENU_ registros",
                info: "Mostrando _START_ a _END_ de _TOTAL_ entradas",
                paginate: { first: "Primero", last: "Último", next: "Siguiente", previous: "Anterior" },
                loadingRecords: "Cargando cotizaciones...",
                zeroRecords: "No se encontraron resultados",
                emptyTable: "No hay datos disponibles"
            },
            stateSave: true,
            order: [[1, 'desc']], // Ordenar por fecha
            pageLength: 20
        });

        // --- COTIZACIONES POR CLIENTE ---
        window.tableCustomerQuotations = $('#customerQuotationsTable').DataTable({
            ajax: {
                url: '/api/customer-quotations',
                dataSrc: function (json) {
                    // Actualizar el filtro de clientes dinámicamente
                    const customers = [...new Set(json.map(r => r.customer_name))].sort();
                    const filterSelect = $('#filterCustQuotCustomer');
                    const currentValue = filterSelect.val();

                    filterSelect.html('<option value="all">Todos los clientes importados</option>');
                    customers.forEach(c => {
                        filterSelect.append(`<option value="${c}">${c}</option>`);
                    });

                    if (customers.includes(currentValue)) {
                        filterSelect.val(currentValue);
                        setTimeout(() => {
                            if (window.tableCustomerQuotations) {
                                window.tableCustomerQuotations.column(0).search('^' + $.fn.dataTable.util.escapeRegex(currentValue) + '$', true, false).draw();
                            }
                        }, 50);
                    } else {
                        filterSelect.val('all');
                        setTimeout(() => {
                            if (window.tableCustomerQuotations) {
                                window.tableCustomerQuotations.column(0).search('').draw();
                            }
                        }, 50);
                    }

                    return json;
                },
                beforeSend: function (request) {
                    const tk = localStorage.getItem('volper_token');
                    if (tk) request.setRequestHeader("Authorization", "Bearer " + tk);
                }
            },
            columns: [
                { data: 'customer_name', defaultContent: '' },
                { data: 'number_full', render: data => `<strong>${data}</strong>` },
                { data: 'date_of_issue' },
                { 
                    data: null,
                    render: function (data, type, row) {
                        if (row.is_billed) {
                            return `<span class="badge" style="font-size: 0.8rem; background-color: #2ecc71; color: white;" title="${row.document_ref || ''}">✔️ Sí (${row.document_ref || 'Factura'})</span>`;
                        } else {
                            return `<span class="badge" style="font-size: 0.8rem; background-color: #95a5a6; color: white;">❌ No</span>`;
                        }
                    }
                },
                { data: 'internal_id', render: data => `<code style="font-size:0.85rem; font-weight:bold; color:var(--primary-color);">${data}</code>` },
                { data: 'quantity', defaultContent: '0' },
                {
                    data: 'sale_unit_price',
                    render: function (data) {
                        return `S/ ${parseFloat(data).toFixed(2)}`;
                    }
                },
                {
                    data: 'unit_price',
                    render: function (data) {
                        return `<strong style="color:#2ecc71;">S/ ${parseFloat(data).toFixed(2)}</strong>`;
                    }
                },
                {
                    data: 'total',
                    render: function (data) {
                        return `<strong style="color:var(--primary-color);">S/ ${parseFloat(data).toFixed(2)}</strong>`;
                    }
                }
            ],
            language: {
                search: "Buscar:",
                lengthMenu: "Mostrar _MENU_ registros",
                info: "Mostrando _START_ a _END_ de _TOTAL_ entradas",
                paginate: { first: "Primero", last: "Último", next: "Siguiente", previous: "Anterior" },
                loadingRecords: "Cargando registros...",
                zeroRecords: "No se encontraron resultados",
                emptyTable: "No hay registros importados. ¡Busca e importa un cliente arriba!"
            },
            stateSave: true,
            pageLength: 20,
            scrollX: true
        });

        // Registrar el manejador de eventos para el dropdown de filtro por cliente
        $('#filterCustQuotCustomer').on('change', function () {
            const val = $(this).val();
            if (val === 'all') {
                window.tableCustomerQuotations.column(0).search('').draw();
            } else {
                window.tableCustomerQuotations.column(0).search(val ? '^' + $.fn.dataTable.util.escapeRegex(val) + '$' : '', true, false).draw();
            }
        });
    }

    // Botón para Sincronizar Facturas
    $('#btnSyncInvoices').click(async function () {
        const btn = $(this);
        window.showToast("Sincronizando facturas... esto puede tardar un poco.", "info");
        btn.prop('disabled', true);
        try {
            const res = await fetchWithAuth('/api/sync-invoices', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                window.showToast(`Sincronización completa. Cotizaciones actualizadas: ${data.updatedCount}`, "success");
                window.cargarHistorial();
            } else {
                window.showToast(`Error al sincronizar: ${data.error}`, "error");
            }
        } catch (e) {
            window.showToast("Error de conexión al sincronizar.", "error");
        }
        btn.prop('disabled', false);
    });

    $('#btnUpdate').click(async function () {
        const btn = $(this);
        btn.prop('disabled', true);
        $('#status').text("⏳ Procesando productos... Por favor espere.");

        try {
            const res = await fetchWithAuth('/api/update-catalog');
            const data = await res.json();
            if (res.ok && data.success) {
                $('#status').text("✅ ¡Éxito! Recargando tabla...");
                table.ajax.reload();
            } else {
                $('#status').text("❌ " + (data.error || data.message || "Error al actualizar."));
            }
        } catch (err) {
            $('#status').text("❌ Error en la comunicación.");
        } finally {
            btn.prop('disabled', false);
        }
    });

    $('#btnUpdateMovimientos').click(async function () {
        const btn = $(this);
        btn.prop('disabled', true);
        $('#statusMovimientos').text("⏳ Extrayendo movimientos... Por favor espere.");

        try {
            const res = await fetchWithAuth('/api/update-movimientos');
            const data = await res.json();
            if (res.ok && data.success) {
                $('#statusMovimientos').text("✅ ¡Éxito! Recargando tabla...");
                tableMovimientos.ajax.reload();
            } else {
                $('#statusMovimientos').text("❌ " + (data.error || data.message || "Error al actualizar."));
            }
        } catch (err) {
            $('#statusMovimientos').text("❌ Error en la comunicación.");
        } finally {
            btn.prop('disabled', false);
        }
    });

    let clickedRowRef = null;

    // Modal Ingreso Logic
    $('#movimientosTable').on('click', '.btn-ingreso', function () {
        const btn = $(this);
        clickedRowRef = tableMovimientos.row(btn.parents('tr'));

        const item_id = btn.data('item_id');
        const item_code = btn.data('item_code');
        const item_desc = btn.data('item_desc');
        const wh_id = btn.data('wh_id');
        const wh_desc = btn.data('wh_desc');

        $('#ingItem_id').val(item_id);
        $('#ingItemName').val(`${item_code} - ${item_desc}`);
        $('#ingWarehouse_id').val(wh_id);
        $('#ingWarehouseName').val(wh_desc);
        $('#ingQuantity').val('');
        $('#ingComments').val('');

        $('#modalIngreso').css('display', 'flex');
    });

    $('.close-modal').click(function () {
        $('#modalIngreso').css('display', 'none');
    });

    let isSubmitting = false;

    $('#formIngreso').submit(async function (e) {
        e.preventDefault();
        if (isSubmitting) return; // Evitar doble submit por doble clic
        isSubmitting = true;

        const btn = $('#btnSubmitIngreso');
        btn.prop('disabled', true).text('Guardando...');

        const payload = {
            item_id: $('#ingItem_id').val(),
            warehouse_id: $('#ingWarehouse_id').val(),
            quantity: $('#ingQuantity').val(),
            inventory_transaction_id: $('#ingTransactionId').val(),
            comments: $('#ingComments').val(),
            
            // Datos extra para el historial Kardex
            item_code: clickedRowRef ? clickedRowRef.data().item_internal_id : '',
            item_description: clickedRowRef ? clickedRowRef.data().item_description : '',
            warehouse_description: clickedRowRef ? (window.warehouseAliasesById[$('#ingWarehouse_id').val()] || $('#ingWarehouseName').val()) : '',
            initial_stock: clickedRowRef ? clickedRowRef.data().stock : 0
        };

        try {
            const res = await window.fetchWithAuth('/api/add-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast("Ingreso registrado exitosamente", "success");

                // Actualizar localmente la fila en la tabla de movimientos
                if (clickedRowRef) {
                    const rowData = clickedRowRef.data();
                    const qty = parseFloat(payload.quantity) || 0;
                    rowData.stock = (parseFloat(rowData.stock) || 0) + qty;
                    clickedRowRef.data(rowData).draw(false);
                }

                // Cerrar modal al cabo de unos segundos
                setTimeout(() => {
                    $('#modalIngreso').css('display', 'none');
                }, 1500);
            } else {
                window.showToast("Error: " + (data.error || "No se pudo registrar"), "error");
            }
        } catch (err) {
            window.showToast("Error de conexión o red", "error");
        } finally {
            btn.prop('disabled', false).text('Aceptar');
            isSubmitting = false; // Resetear guardia
        }
    });

    // Modal Traslado Logic
    $('#movimientosTable').on('click', '.btn-traslado', function () {
        const btn = $(this);
        clickedRowRef = tableMovimientos.row(btn.parents('tr'));

        const item_id = btn.data('item_id');
        const item_code = btn.data('item_code');
        const item_desc = btn.data('item_desc');
        const wh_id = btn.data('wh_id');
        const wh_desc = btn.data('wh_desc');
        const stock = parseFloat(btn.data('stock')) || 0;

        $('#trasItem_id').val(item_id);
        $('#trasItemName').val(`${item_code} - ${item_desc}`);
        $('#trasWarehouse_id').val(wh_id);
        $('#trasWarehouseName').val(wh_desc);
        $('#trasStockCurrent').val(stock);
        $('#trasMaxQty').text(stock);
        
        $('#trasQuantity').val('').attr('max', stock);
        $('#trasTargetWarehouse').val('');
        $('#trasComments').val('');

        $('#modalTraslado').css('display', 'flex');
    });

    $('#formTraslado').submit(async function (e) {
        e.preventDefault();
        if (isSubmitting) return;
        
        const qty = parseFloat($('#trasQuantity').val());
        const maxQty = parseFloat($('#trasStockCurrent').val());
        if (qty > maxQty) {
            window.showToast("La cantidad supera el stock actual", "error");
            return;
        }

        isSubmitting = true;
        const btn = $('#btnSubmitTraslado');
        btn.prop('disabled', true).text('Trasladando...');

        const payload = {
            id: null,
            item_id: $('#trasItem_id').val(),
            warehouse_id: $('#trasWarehouse_id').val(),
            quantity: maxQty, // stock original
            warehouse_new_id: $('#trasTargetWarehouse').val(),
            quantity_move: qty,
            quantity_real: maxQty - qty,
            lots_enabled: false,
            series_enabled: false,
            lots: [],
            lots_group: [],
            detail: $('#trasComments').val() || "Traslado desde dashboard",
            
            // Para el Kardex
            item_code: clickedRowRef ? clickedRowRef.data().item_internal_id : '',
            item_description: clickedRowRef ? clickedRowRef.data().item_description : '',
            warehouse_description: clickedRowRef ? (window.warehouseAliasesById[$('#trasWarehouse_id').val()] || $('#trasWarehouseName').val()) : '',
            target_warehouse_description: window.warehouseAliasesById[$('#trasTargetWarehouse').val()] || ''
        };

        try {
            const res = await window.fetchWithAuth('/api/move-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast("Traslado registrado exitosamente", "success");

                if (clickedRowRef) {
                    const rowData = clickedRowRef.data();
                    rowData.stock = (parseFloat(rowData.stock) || 0) - qty;
                    clickedRowRef.data(rowData).draw(false);
                }

                setTimeout(() => {
                    $('#modalTraslado').css('display', 'none');
                }, 1500);
            } else {
                window.showToast(data.error || "Error al registrar traslado", "error");
            }
        } catch (error) {
            window.showToast("Error de conexión", "error");
        } finally {
            isSubmitting = false;
            btn.prop('disabled', false).text('Trasladar');
        }
    });

    document.getElementById('btnAddQuotation').addEventListener('click', async () => {
        const num = document.getElementById('quotationInput').value;

        if (!num) return alert("Ingresa un número de cotización");

        window.showToast(`Extrayendo cotización ${num} de Volper...`, "info");

        try {
            const res = await fetchWithAuth('/api/add-quotation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quotationNumber: num })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast(`Cotización ${num} agregada correctamente.`, "success");
                window.cargarHistorial();
                const nroCompleto = "COT-" + num;
                verCotizacion(nroCompleto);
                document.getElementById('quotationInput').value = ''; // limpiar input
            } else {
                window.showToast(`Error: ${data.error || data.message}`, "error");
            }
        } catch (err) {
            window.showToast("Error de conexión al servidor.", "error");
        }
    });

    document.getElementById('btnCloseDetail').addEventListener('click', () => {
        document.getElementById('detailContainer').style.display = 'none';
    });

    // Abrir Modal de Eliminación
    $('#btnOpenDeleteModal').click(function () {
        $('#deleteQuotationInput').val('');
        $('#modalDeleteQuotation').css('display', 'flex');
    });

    // Cerrar Modal de Eliminación
    $('.close-modal-delete').click(function () {
        $('#modalDeleteQuotation').css('display', 'none');
    });

    // Confirmar y Eliminar Cotización
    $('#btnSubmitDeleteQuotation').click(async function () {
        const num = document.getElementById('deleteQuotationInput').value;

        if (!num) return alert("Ingresa un número de cotización");

        const btn = $(this);
        btn.prop('disabled', true).text('Eliminando...');
        window.showToast(`Eliminando cotización ${num}...`, "info");

        try {
            const res = await fetchWithAuth(`/api/quotations/${num}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast(`Cotización COT-${num} eliminada correctamente.`, "success");
                $('#modalDeleteQuotation').css('display', 'none');
                window.cargarHistorial();
            } else {
                window.showToast(`Error: ${data.error || 'No se pudo eliminar'}`, "error");
            }
        } catch (e) {
            window.showToast("Error de conexión al servidor.", "error");
        }
        btn.prop('disabled', false).text('Confirmar Eliminar');
    });

    window.cargarHistorial = function () {
        if (tableQuotations) {
            tableQuotations.ajax.reload(null, false);
        }
    };
});

window.cambiarEstadoCotizacion = async function (id, newStatus) {
    if (!newStatus) return;
    try {
        const res = await window.fetchWithAuth(`/api/quotations/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert(`✅ Estado actualizado a ${newStatus}`);
            cargarHistorial();
            if ($.fn.DataTable.isDataTable('#productsTable')) {
                $('#productsTable').DataTable().ajax.reload(null, false);
            }
            if ($.fn.DataTable.isDataTable('#catalogTable')) {
                $('#catalogTable').DataTable().ajax.reload(null, false);
            }
        } else {
            alert("❌ Error: " + (data.error || "No se pudo actualizar"));
        }
    } catch (e) {
        alert("❌ Error de conexión");
    }
};

// Expone la función globalmente para que pueda ser llamada desde el HTML (onclick)
window.verCotizacion = async function (numero) {
    try {
        const res = await window.fetchWithAuth(`/api/quotations/${numero}`);
        const data = await res.json();

        if (res.ok) {
            // Highlight row
            $('.quotation-row').removeClass('table-active');
            $(`#row-${numero}`).addClass('table-active');

            // Mostrar la card de detalles suavemente
            const detailContainer = document.getElementById('detailContainer');
            detailContainer.style.display = 'block';
            detailContainer.scrollIntoView({ behavior: 'smooth' });

            document.getElementById('detNumber').innerText = "Detalle: " + data.number;
            document.getElementById('detCustomer').innerText = data.customerName;
            document.getElementById('detAddress').innerText = data.address || 'N/A';
            document.getElementById('detDateTime').innerText = data.date + " " + data.time;

            const sellerEl = document.getElementById('detSeller');
            if (sellerEl) sellerEl.innerText = data.sellerName || 'Ventas';

            const descEl = document.getElementById('detDescription');
            if (descEl) descEl.innerText = data.description || 'N/A';

            const btnReserve = document.getElementById('btnReserveDetail');
            if (data.status === 'PENDIENTE') {
                btnReserve.style.display = 'inline-block';
                btnReserve.onclick = async () => {
                    await window.cambiarEstadoCotizacion(data.id, 'RESERVADO');
                    window.verCotizacion(data.number); // Recargar el detalle
                };
            } else {
                btnReserve.style.display = 'none';
            }

            const tbody = document.getElementById('detItemsBody');
            tbody.innerHTML = "";

            // Contar ocurrencias de cada productId para identificar duplicados
            const productCounts = {};
            data.items.forEach(item => {
                if (item.productId) {
                    productCounts[item.productId] = (productCounts[item.productId] || 0) + 1;
                }
            });

            data.items.forEach((item, index) => {
                const stockOk = item.stockDisponibleParaMi >= item.quantity;
                const colorStock = stockOk ? "var(--success-color)" : "var(--danger-color)";
                let estado = stockOk ? "✅ Disponible" : "❌ Insuficiente";

                if (data.status === 'RESERVADO') estado = "🔒 Reservado";
                if (data.status === 'FACTURADO') estado = "📦 Facturado";

                const isDuplicated = item.productId && productCounts[item.productId] > 1;
                const rowStyle = isDuplicated ? 'style="background-color: #fffbeb; transition: background-color 0.3s ease;"' : '';
                const duplicateBadge = isDuplicated ? '<span style="background-color: #fef3c7; color: #d97706; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; margin-left: 8px; border: 1px dashed #f59e0b;">⚠️ Duplicado</span>' : '';

                tbody.innerHTML += `
                    <tr ${rowStyle}>
                        <td style="color: #888; font-weight: bold;">${index + 1}</td>
                        <td>${item.description}${duplicateBadge}</td>
                        <td><strong>${item.quantity}</strong></td>
                        <td style="color: #f39c12; font-weight: bold;">${item.reservaGlobal}</td>
                        <td style="font-weight: bold; color: ${colorStock};">${item.stockDispGlobal}</td>
                        <td>${estado}</td>
                    </tr>
                `;
            });

            // Registrar manejador para botón de PDF
            document.getElementById('btnPdfDetail').onclick = () => {
                generarCotizacionPDF(data);
            };
        } else {
            alert("Error al obtener detalle: " + data.error);
        }
    } catch (e) {
        console.error("Error al ver cotización", e);
    }
}

// --- IMPORTAR ORÍGENES DESDE EXCEL ---
$(document).on('change', '#excelImportInput', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    window.showToast("Leyendo archivo...", "info");

    const reader = new FileReader();
    reader.onload = async function (evt) {
        try {
            const data = evt.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            if (rows.length === 0) {
                window.showToast("El archivo está vacío.", "error");
                return;
            }

            // Detectar nombres de columnas
            const firstRow = rows[0];
            let internalIdKey = null;
            let originWarehouseKey = null;

            for (const key of Object.keys(firstRow)) {
                const keyNorm = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remover acentos
                if (!internalIdKey && (keyNorm.includes("cod") || keyNorm.includes("id") || keyNorm.includes("sku") || keyNorm.includes("intern"))) {
                    internalIdKey = key;
                } else if (!originWarehouseKey && (keyNorm.includes("almac") || keyNorm.includes("orig") || keyNorm.includes("ubic") || keyNorm.includes("wh") || keyNorm.includes("ware"))) {
                    originWarehouseKey = key;
                }
            }

            // Fallbacks si no se detectan automáticamente
            if (!internalIdKey) internalIdKey = Object.keys(firstRow)[0];
            if (!originWarehouseKey) originWarehouseKey = Object.keys(firstRow)[1];

            if (!internalIdKey || !originWarehouseKey) {
                window.showToast("No se encontraron las columnas necesarias (Código Interno / Almacén).", "error");
                return;
            }

            // Convertir a formato plano para enviar al backend
            const itemsToImport = rows.map(r => {
                const internal_id = String(r[internalIdKey] || '').trim();
                const originWarehouse = String(r[originWarehouseKey] || '').trim();
                return {
                    internal_id: internal_id,
                    originWarehouse: originWarehouse === "" ? null : originWarehouse
                };
            }).filter(item => item.internal_id !== "");

            if (itemsToImport.length === 0) {
                window.showToast("No se encontraron registros válidos para importar.", "error");
                return;
            }

            window.showToast(`Importando orígenes de ${itemsToImport.length} productos...`, "info");

            const res = await fetchWithAuth('/api/catalog/import-origins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: itemsToImport })
            });

            const resData = await res.json();
            if (res.ok && resData.success) {
                window.showToast(resData.message, "success");

                // Recargar tablas para ver cambios
                if (tableCatalog) tableCatalog.ajax.reload(null, false);
                if (table) table.ajax.reload(null, false);
            } else {
                window.showToast(resData.error || "Error al importar orígenes.", "error");
            }

        } catch (err) {
            console.error("Error al procesar excel:", err);
            window.showToast("Error al procesar el archivo Excel. Asegúrate de que no esté dañado.", "error");
        } finally {
            // Limpiar input para permitir subir el mismo archivo otra vez
            document.getElementById('excelImportInput').value = "";
        }
    };

    reader.readAsBinaryString(file);
});

// --- LÓGICA Y MANEJADORES DE COTIZACIONES POR CLIENTE ---
let progressInterval = null;

function pollImportProgress() {
    if (progressInterval) clearInterval(progressInterval);

    $('#custQuotProgressBox').slideDown();
    $('#btnImportCustQuot').prop('disabled', true).text('⏳ Importando...');

    progressInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/import-customer-progress');
            if (res.ok) {
                const data = await res.json();

                if (data.status === 'running') {
                    const percent = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
                    $('#custQuotProgressMessage').text(data.message || 'Procesando...');
                    $('#custQuotProgressPercent').text(`${percent}%`);
                    $('#custQuotProgressBar').css('width', `${percent}%`);
                    if (data.currentQuotation) {
                        $('#custQuotProgressDetails').text(`Última cotización: ${data.currentQuotation} (${data.current} de ${data.total})`);
                    } else {
                        $('#custQuotProgressDetails').text('');
                    }
                } else if (data.status === 'done') {
                    clearInterval(progressInterval);
                    progressInterval = null;
                    $('#custQuotProgressBox').slideUp();
                    $('#btnImportCustQuot').prop('disabled', false).text('⚡ Importar Cliente');
                    window.showToast(data.message || 'Importación completada con éxito.');
                    if (window.tableCustomerQuotations) window.tableCustomerQuotations.ajax.reload();
                } else if (data.status === 'error') {
                    clearInterval(progressInterval);
                    progressInterval = null;
                    $('#custQuotProgressBox').slideUp();
                    $('#btnImportCustQuot').prop('disabled', false).text('⚡ Importar Cliente');
                    window.showToast(data.message || 'Error durante la importación.', 'error');
                }
            }
        } catch (e) {
            console.error("Error al consultar el progreso:", e);
        }
    }, 1000);
}

// Iniciar importación de cliente
$(document).on('click', '#btnImportCustQuot', async function () {
    const query = $('#custQuotQueryInput').val().trim();
    if (!query) {
        window.showToast('Por favor introduce el RUC o Nombre del cliente.', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/import-customer-quotations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            window.showToast('Proceso de importación iniciado.', 'info');
            pollImportProgress();
        } else {
            window.showToast(data.error || 'Error al iniciar importación.', 'error');
        }
    } catch (e) {
        window.showToast('Error de conexión al iniciar importación.', 'error');
    }
});

// Quitar un cliente de la lista
$(document).on('click', '#btnClearSelectedCustQuot', async function () {
    const selected = $('#filterCustQuotCustomer').val();
    if (!selected || selected === 'all') {
        window.showToast('Por favor selecciona un cliente específico en el filtro para quitarlo.', 'warning');
        return;
    }

    if (confirm(`¿Estás seguro de que deseas quitar todos los registros del cliente "${selected}"?`)) {
        try {
            const res = await fetchWithAuth('/api/customer-quotations', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_name: selected })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast(`Registros de "${selected}" eliminados.`);
                if (window.tableCustomerQuotations) window.tableCustomerQuotations.ajax.reload();
            } else {
                window.showToast(data.error || 'Error al eliminar registros.', 'error');
            }
        } catch (e) {
            window.showToast('Error de conexión al eliminar.', 'error');
        }
    }
});

// Limpiar todos los registros por cliente
$(document).on('click', '#btnClearAllCustQuot', async function () {
    if (confirm('¿Estás seguro de que deseas eliminar TODOS los registros por cliente importados localmente?')) {
        try {
            const res = await fetchWithAuth('/api/customer-quotations', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await res.json();
            if (res.ok && data.success) {
                window.showToast('Todos los registros eliminados correctamente.');
                if (window.tableCustomerQuotations) window.tableCustomerQuotations.ajax.reload();
            } else {
                window.showToast(data.error || 'Error al limpiar los datos.', 'error');
            }
        } catch (e) {
            window.showToast('Error de conexión.', 'error');
        }
    }
});

// Consultar progreso al cargar por si quedó a medias
setTimeout(async () => {
    try {
        const res = await fetch('/api/import-customer-progress');
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'running') {
                pollImportProgress();
            }
        }
    } catch (e) { }
}, 500);

// --- LÓGICA Y MANEJADORES DE REVISAR COTIZACIÓN ---
window.tableReviewQuotationItems = null;
window.currentReviewedQuotationClient = "";

// Función para buscar y extraer cotización
$(document).on('click', '#btnSearchReviewQuot', async function() {
    const inputVal = $('#reviewQuotNumberInput').val().trim();
    if (!inputVal) {
        window.showToast('Por favor introduce el número de cotización.', 'warning');
        return;
    }

    const btn = $(this);
    btn.prop('disabled', true).text('⏳ Extrayendo...');
    $('#reviewQuotLoaderBox').slideDown();
    $('#reviewQuotLoaderText').text('Conectando a Volper Seal...');
    $('#reviewQuotDataContainer').slideUp();

    try {
        const res = await fetch(`/api/review-quotation/${encodeURIComponent(inputVal)}`);
        const data = await res.json();

        if (res.ok && data.success) {
            window.showToast(`Cotización ${data.number_full} cargada y guardada con éxito.`);
            
            // Cargar todos los registros locales de historial de forma preventiva y síncrona
            let allRecords = [];
            try {
                const histRes = await fetch('/api/customer-quotations');
                if (histRes.ok) {
                    allRecords = await histRes.json();
                }
            } catch (e) {
                console.error("Error precargando historial:", e);
            }
            window.allCustomerQuotations = allRecords;

            // Llenar cabecera
            window.currentReviewedQuotationClient = data.customer_name;
            $('#reviewQuotClientName').text(data.customer_name);
            $('#reviewQuotClientRuc').text(`RUC: ${data.customer_number || 'No especificado'}`);
            $('#reviewQuotDocNumber').text(data.number_full);
            $('#reviewQuotDocDate').text(`Emisión: ${data.date_of_issue}`);

            // Inicializar o recrear tabla
            if (window.tableReviewQuotationItems) {
                window.tableReviewQuotationItems.destroy();
            }

            // Limpiar tbody
            $('#reviewQuotationItemsTable tbody').html('');

            window.tableReviewQuotationItems = $('#reviewQuotationItemsTable').DataTable({
                data: data.items,
                columns: [
                    {
                        className: 'details-control',
                        orderable: false,
                        data: null,
                        render: function(data, type, row) {
                            const currentQuotNumber = $('#reviewQuotDocNumber').text().trim();
                            const hasHistory = (window.allCustomerQuotations || []).some(r => r.internal_id === row.internal_id && r.number_full !== currentQuotNumber);
                            return hasHistory ? '➕' : '';
                        }
                    },
                    { data: 'internal_id' },
                    { data: 'item_description' },
                    { 
                        data: 'quantity',
                        render: function(val) { return `<strong>${val}</strong>`; }
                    },
                    { 
                        data: 'sale_unit_price',
                        render: function(val) { return `S/ ${parseFloat(val).toFixed(2)}`; }
                    },
                    { 
                        data: 'unit_price',
                        render: function(val) { return `<span style="color: #2ecc71; font-weight: bold;">S/ ${parseFloat(val).toFixed(2)}</span>`; }
                    },
                    { 
                        data: 'total',
                        render: function(val) { return `<span style="color: var(--primary-color); font-weight: bold;">S/ ${parseFloat(val).toFixed(2)}</span>`; }
                    }
                ],
                language: {
                    search: "Filtrar en tabla:",
                    lengthMenu: "Mostrar _MENU_ registros",
                    info: "Mostrando _START_ a _END_ de _TOTAL_ entradas",
                    paginate: { first: "Primero", last: "Último", next: "Siguiente", previous: "Anterior" },
                    zeroRecords: "No se encontraron resultados",
                    emptyTable: "No hay productos en esta cotización"
                },
                pageLength: 50,
                order: [[1, 'asc']]
            });

            $('#reviewQuotDataContainer').slideDown();

        } else {
            window.showToast(data.error || 'No se pudo cargar la cotización.', 'error');
        }
    } catch(e) {
        console.error(e);
        window.showToast('Error de conexión al servidor.', 'error');
    } finally {
        btn.prop('disabled', false).text('⚡ Extraer y Revisar');
        $('#reviewQuotLoaderBox').slideUp();
    }
});

// Manejador del botón "+" para expandir/colapsar historial
$(document).on('click', '#reviewQuotationItemsTable tbody td.details-control', function() {
    const cellText = $(this).text().trim();
    if (cellText === '') {
        return; // Si no hay ícono de más (+), significa que el ítem no tiene historial y no hace nada
    }

    const tr = $(this).closest('tr');
    const row = window.tableReviewQuotationItems.row(tr);
    const rowData = row.data();

    if (row.child.isShown()) {
        // Cerrar fila
        row.child.hide();
        tr.removeClass('shown');
        $(this).text('➕');
    } else {
        // Abrir fila instantáneamente usando el historial ya pre-cargado
        $(this).text('➖');
        tr.addClass('shown');

        const allRecords = window.allCustomerQuotations || [];
        const currentQuotNumber = $('#reviewQuotDocNumber').text().trim();

        // Filtrar registros que coincidan con este internal_id y excluir la cotización actual
        const itemHistory = allRecords.filter(r => r.internal_id === rowData.internal_id && r.number_full !== currentQuotNumber);
        
        // Formatear e inyectar subtabla de inmediato
        const subtableHtml = formatHistorySubtable(itemHistory, window.currentReviewedQuotationClient);
        row.child(subtableHtml).show();
    }
});

// Helper para dar formato premium a la subtabla del historial de ventas
function formatHistorySubtable(history, currentClient) {
    if (!history || history.length === 0) {
        return `
            <div style="padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 5px 0; color: #2c3e50; font-size: 0.9rem;">📊 Historial de Cotizaciones</h4>
                <div style="color: var(--text-muted); font-size: 0.85rem;">No hay cotizaciones previas de este producto registradas localmente en el historial.</div>
            </div>
        `;
    }
    
    // Ordenar historial por fecha de forma descendente
    history.sort((a, b) => new Date(b.date_of_issue) - new Date(a.date_of_issue));

    let rowsHtml = '';
    history.forEach(h => {
        const isSameClient = h.customer_name.toLowerCase() === currentClient.toLowerCase();
        const trClass = isSameClient ? 'class="highlight-same-client"' : '';
        const clientLabel = isSameClient ? `<strong>(Este Cliente)</strong> ${h.customer_name}` : h.customer_name;
        
        let billedLabel = '';
        if (h.is_billed) {
            billedLabel = `<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; background-color: #d1e7dd; color: #0f5132; font-weight: bold; border: 1px solid #a3cfbb;" title="${h.document_ref || ''}">✔️ Sí (${h.document_ref || 'Fact.'})</span>`;
        } else {
            billedLabel = `<span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; background-color: #f8d7da; color: #842029; font-weight: bold; border: 1px solid #f5c2c7;">❌ No</span>`;
        }

        rowsHtml += `
            <tr ${trClass}>
                <td>${h.number_full}</td>
                <td>${h.date_of_issue}</td>
                <td style="text-align: center;">${billedLabel}</td>
                <td>${clientLabel}</td>
                <td style="text-align: center;">${h.quantity}</td>
                <td style="text-align: right;">S/ ${parseFloat(h.sale_unit_price).toFixed(2)}</td>
                <td style="text-align: right; font-weight: bold; color: ${isSameClient ? '#065f46' : '#2ecc71'};">S/ ${parseFloat(h.unit_price).toFixed(2)}</td>
                <td style="text-align: right; font-weight: bold;">S/ ${parseFloat(h.total).toFixed(2)}</td>
            </tr>
        `;
    });

    return `
        <div style="padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #cbd5e0; margin: 10px 0;">
            <h4 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 0.95rem;">📊 Comparador de Precios Históricos (Código: <strong>${history[0].internal_id}</strong>)</h4>
            <div style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 10px;">
                💡 Las filas en <span style="color: #065f46; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px;">verde</span> corresponden a ventas anteriores realizadas a **este mismo cliente**, permitiéndote validar si su reclamo es verídico.
            </div>
            <table class="history-child-table">
                <thead>
                    <tr>
                        <th style="width: 120px;">Cotización</th>
                        <th style="width: 120px;">Fecha</th>
                        <th style="width: 120px; text-align: center;">¿Vendido?</th>
                        <th>Cliente</th>
                        <th style="width: 80px; text-align: center;">Cant.</th>
                        <th style="width: 120px; text-align: right;">Precio Sistema</th>
                        <th style="width: 120px; text-align: right;">Precio Venta</th>
                        <th style="width: 120px; text-align: right;">Total Venta</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

