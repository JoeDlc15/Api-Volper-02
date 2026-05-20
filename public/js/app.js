document.addEventListener('DOMContentLoaded', async () => {

    // Helper para alertas flotantes (Toast Notifications)
    window.showToast = function(message, type = 'success') {
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
    window.fetchWithAuth = async function(url, options = {}) {
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
                if (filterWH) filterWH.innerHTML = '<option value="all">Todos los almacenes</option>';

                data.forEach(wh => {
                    window.warehouseAliasesByName[wh.name] = wh.alias;
                    window.warehouseAliasesById[wh.id] = wh.alias;
                    
                    if (filterWH) {
                        const option = document.createElement('option');
                        option.value = wh.alias;
                        option.textContent = wh.alias;
                        filterWH.appendChild(option);
                    }
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

    // Evento de submit para guardar la configuración de credenciales
    $(document).on('submit', '#formConfigCredentials', async function(e) {
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
        } catch(e) {
            showToast("Error de conexión al guardar configuración.", "error");
        } finally {
            btn.disabled = false;
            btn.innerText = "💾 Guardar Configuración";
        }
    });

    // Click en botón del banner "Configurar ahora"
    $(document).on('click', '.btn-go-to-config', function() {
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

    // Agregar función de filtrado personalizada para Inventario
    $.fn.dataTable.ext.search.push(
        function(settings, data, dataIndex, rowData, counter) {
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

    // Agregar función de filtrado para Cotizaciones
    $.fn.dataTable.ext.search.push(
        function(settings, data, dataIndex, rowData, counter) {
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
        $('#filterWarehouse, #filterStock').on('change', function() {
            if (table) table.draw();
        });

        $('#filterQuotationStatus, #filterQuotationCustomer').on('change', function() {
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
                    if(xhr.status === 401) cerrarSesion("Sesión expirada");
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
                    render: function(data) {
                        return `<span style="color: ${data > 0 ? '#e74c3c' : '#a0aec0'}; font-weight: bold;">${data}</span>`;
                    }
                },
                { 
                    data: 'stockDiferencia',
                    defaultContent: '0',
                    render: function(data) {
                        return `<span style="color: ${data > 0 ? '#2ecc71' : (data < 0 ? '#e74c3c' : '#f39c12')}; font-weight: bold;">${data}</span>`;
                    }
                },
                { 
                    data: 'warehouse_name', 
                    defaultContent: '',
                    render: function(data) {
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
                    if(xhr.status === 401) cerrarSesion("Sesión expirada");
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
                    render: function(data, type, row) {
                        if (!data) return '';
                        return window.warehouseAliasesById[row.warehouse_id] || (data.includes(' - ') ? data.split(' - ')[1].trim() : data);
                    }
                },
                { data: 'stock' },
                {
                    data: null,
                    render: function (data, type, row) {
                        return `<button class="btn btn-primary btn-ingreso" style="padding: 5px 10px; font-size: 0.8rem;" 
                                data-item_id="${row.item_id}" 
                                data-item_code="${row.item_internal_id}" 
                                data-item_desc="${row.item_description}" 
                                data-wh_id="${row.warehouse_id}" 
                                data-wh_desc="${row.warehouse_description}">➕ Ingreso</button>`;
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
                    if(xhr.status === 401) cerrarSesion("Sesión expirada");
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
        $(document).on('click', '.btn-edit-alias', async function() {
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
                    render: function(data) {
                        if (!data) return '<span style="color:#a0aec0; font-style:italic;">Automático (Por Stock)</span>';
                        return `<strong>${data}</strong>`;
                    }
                },
                {
                    data: null,
                    render: function(data, type, row) {
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
        $(document).on('click', '.btn-edit-origin', async function() {
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
                        if(table) table.ajax.reload(null, false); // Reload Inventario to apply new reservation logic
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
                dataSrc: function(json) {
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
                    render: function(data) {
                        let badgeClass = 'badge-secondary';
                        if (data === 'RESERVADO') badgeClass = 'badge-warning';
                        if (data === 'FACTURADO') badgeClass = 'badge-success';
                        return `<span class="badge ${badgeClass}">${data}</span>`;
                    }
                },
                { 
                    data: 'documentRef',
                    render: function(data) {
                        return `<strong style="color: #6c757d;">${data || '-'}</strong>`;
                    }
                },
                {
                    data: null,
                    render: function(data, type, row) {
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
    $('#movimientosTable').on('click', '.btn-ingreso', function() {
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

    $('.close-modal').click(function() {
        $('#modalIngreso').css('display', 'none');
    });

    let isSubmitting = false;

    $('#formIngreso').submit(async function(e) {
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
            comments: $('#ingComments').val()
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
    $('#btnOpenDeleteModal').click(function() {
        $('#deleteQuotationInput').val('');
        $('#modalDeleteQuotation').css('display', 'flex');
    });

    // Cerrar Modal de Eliminación
    $('.close-modal-delete').click(function() {
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

    window.cargarHistorial = function() {
        if (tableQuotations) {
            tableQuotations.ajax.reload(null, false);
        }
    };
});

window.cambiarEstadoCotizacion = async function(id, newStatus) {
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
$(document).on('change', '#excelImportInput', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    window.showToast("Leyendo archivo...", "info");

    const reader = new FileReader();
    reader.onload = async function(evt) {
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
