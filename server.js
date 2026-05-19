// Al principio de server.js, configura el cliente con cookies igual que en extraer_auto.js
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');

const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// AGREGA ESTA LÍNEA AQUÍ (Es vital para procesar el número de cotización)
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

const jar = new CookieJar();
const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    baseURL: 'https://volperseal.goldensystem.com.pe'
}));

const fs = require('fs');

function getSavedCredentials() {
    const credPath = path.join(__dirname, 'credentials.json');
    if (fs.existsSync(credPath)) {
        try {
            return JSON.parse(fs.readFileSync(credPath, 'utf8'));
        } catch (e) {
            console.error("Error reading credentials.json:", e);
        }
    }
    return {
        ventasEmail: "",
        ventasPassword: "",
        almacenEmail: "",
        almacenPassword: ""
    };
}

function saveSavedCredentials(creds) {
    const credPath = path.join(__dirname, 'credentials.json');
    fs.writeFileSync(credPath, JSON.stringify(creds, null, 4));
}

// Bypasseamos el control de sesión ya que la app corre localmente sin login
function getUser(req) {
    return { email: "config@config.com" }; 
}

// Función para asegurar login con credenciales dinámicas en Volper
async function login(email, password) {
    const loginPage = await client.get('/login');
    const $ = cheerio.load(loginPage.data);
    const csrfToken = $('input[name="_token"]').val();
    const loginResponse = await client.post('/login', new URLSearchParams({
        '_token': csrfToken,
        'email': email,
        'password': password
    }));

    const finalUrl = loginResponse.request.res ? loginResponse.request.res.responseUrl : loginResponse.request.path;
    if (finalUrl && finalUrl.endsWith('/login')) {
        throw new Error("Credenciales inválidas");
    }
}

// Endpoint para obtener credenciales guardadas (enmascarando contraseñas)
app.get('/api/config/credentials', (req, res) => {
    const creds = getSavedCredentials();
    const hasVentas = !!(creds.ventasEmail && creds.ventasPassword);
    const hasAlmacen = !!(creds.almacenEmail && creds.almacenPassword);
    res.json({
        success: true,
        configured: hasVentas && hasAlmacen,
        ventasEmail: creds.ventasEmail || "",
        almacenEmail: creds.almacenEmail || "",
        ventasPassword: creds.ventasPassword ? "••••••••" : "",
        almacenPassword: creds.almacenPassword ? "••••••••" : ""
    });
});

// Endpoint para guardar credenciales
app.post('/api/config/credentials', (req, res) => {
    const { ventasEmail, ventasPassword, almacenEmail, almacenPassword } = req.body;
    const creds = getSavedCredentials();
    
    if (ventasEmail !== undefined) creds.ventasEmail = ventasEmail;
    if (ventasPassword !== undefined && ventasPassword !== "••••••••" && ventasPassword !== "") {
        creds.ventasPassword = ventasPassword;
    }
    
    if (almacenEmail !== undefined) creds.almacenEmail = almacenEmail;
    if (almacenPassword !== undefined && almacenPassword !== "••••••••" && almacenPassword !== "") {
        creds.almacenPassword = almacenPassword;
    }
    
    saveSavedCredentials(creds);
    res.json({ success: true, message: "Configuración guardada correctamente." });
});


// Ruta para activar la sincronización
app.get('/api/update-catalog', (req, res) => {
    console.log("🚀 Iniciando actualización manual desde la web...");

    const creds = getSavedCredentials();
    if (!creds.almacenEmail || !creds.almacenPassword) {
        return res.status(400).json({ success: false, message: "Faltan configurar las credenciales de Almacén." });
    }

    const env = { ...process.env, API_EMAIL: creds.almacenEmail, API_PASSWORD: creds.almacenPassword };
    exec('node scripts/extraer_auto.js && node scripts/import.js && node scripts/update_warehouses.js', { env }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Error: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
        console.log(`✅ Resultado: ${stdout}`);
        res.json({ success: true, message: "Catálogo actualizado exitosamente." });
    });
});

app.get('/api/update-movimientos', (req, res) => {
    console.log("🚀 Iniciando extracción de movimientos...");

    const creds = getSavedCredentials();
    if (!creds.almacenEmail || !creds.almacenPassword) {
        return res.status(400).json({ success: false, message: "Faltan configurar las credenciales de Almacén." });
    }

    const env = { ...process.env, API_EMAIL: creds.almacenEmail, API_PASSWORD: creds.almacenPassword };
    exec('node scripts/extraer_movimiento.js && node scripts/update_warehouses.js', { env }, (error, stdout, stderr) => {
        if (stdout) console.log(`[Movimientos stdout]:\n${stdout}`);
        if (stderr) console.error(`[Movimientos stderr]:\n${stderr}`);
        
        if (error) {
            console.error(`❌ Error: ${error.message}`);
            return res.status(500).json({ success: false, message: error.message });
        }
        res.json({ success: true, message: "Movimientos actualizados." });
        console.log("🚀 Movimientos actualizados exitosamente.");
    });
});

app.get('/api/movimientos', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'movimiento.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(data);
            res.json(parsed.data ? parsed.data : parsed);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Añade esto a tu archivo server.js actual
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Ruta para obtener los productos para la tabla
app.get('/api/products', async (req, res) => {
    try {
        // Extraer reservas actuales usando findMany
        const reservedItems = await prisma.quotationItem.findMany({
            where: { quotation: { status: 'RESERVADO' } }
        });

        const reservationMap = {};
        reservedItems.forEach(item => {
            reservationMap[item.productId] = (reservationMap[item.productId] || 0) + item.quantity;
        });

        // Obtener la configuración de almacén de origen de cada producto
        const dbProducts = await prisma.product.findMany({
            select: { internal_id: true, originWarehouse: true }
        });
        const originMap = {};
        dbProducts.forEach(p => {
            if (p.originWarehouse) originMap[p.internal_id] = p.originWarehouse;
        });

        // Obtener el diccionario de alias de almacenes para hacer coincidir
        const warehouses = await prisma.warehouse.findMany();
        const aliasMap = {};
        warehouses.forEach(w => {
            aliasMap[w.name] = w.alias || (w.name.includes(' - ') ? w.name.split(' - ')[1].trim() : w.name);
        });

        const jsonPath = path.join(__dirname, 'product.json');
        let useJson = false;
        let dataArray = [];
        if (fs.existsSync(jsonPath)) {
            try {
                const rawData = fs.readFileSync(jsonPath, 'utf8');
                dataArray = JSON.parse(rawData);
                if (Array.isArray(dataArray) && dataArray.length > 0) {
                    useJson = true;
                }
            } catch (e) {
                console.error("Error reading product.json:", e);
            }
        }

        if (useJson) {
            // Agrupar filas por internal_id
            const productsById = {};
            dataArray.forEach(p => {
                if (!productsById[p.internal_id]) productsById[p.internal_id] = [];
                p.reserva = 0;
                p.stockDiferencia = p.stock;
                productsById[p.internal_id].push(p);
            });

            // Asignar reserva según el almacén de origen
            for (const [internal_id, resQ] of Object.entries(reservationMap)) {
                if (resQ > 0 && productsById[internal_id]) {
                    const rows = productsById[internal_id];
                    const originAlias = originMap[internal_id];
                    let targetRow = null;

                    if (originAlias) {
                        targetRow = rows.find(r => {
                            const alias = aliasMap[r.warehouse_name] || (r.warehouse_name.includes(' - ') ? r.warehouse_name.split(' - ')[1].trim() : r.warehouse_name);
                            return alias.toLowerCase() === originAlias.toLowerCase();
                        });
                    }

                    if (targetRow) {
                        targetRow.reserva += resQ;
                        targetRow.stockDiferencia = targetRow.stock - targetRow.reserva;
                    } else {
                        // Fallback: si no hay origen, asignar a la fila con más stock o a la primera
                        rows.sort((a, b) => b.stock - a.stock);
                        rows[0].reserva += resQ;
                        rows[0].stockDiferencia = rows[0].stock - rows[0].reserva;
                    }
                }
            }

            res.setHeader('Content-Type', 'application/json');
            return res.send(JSON.stringify(dataArray));
        } else {
            // Fallback base de datos completo y mapeado para DataTable
            const allDbProducts = await prisma.product.findMany({
                orderBy: { name: 'asc' }
            });
            const mappedProducts = allDbProducts.map(p => {
                const resQ = reservationMap[p.internal_id] || 0;
                return {
                    internal_id: p.internal_id,
                    name: p.name,
                    item_category_name: p.category || 'Sin Categoría',
                    stock: p.stock || 0,
                    reserva: resQ,
                    stockDiferencia: p.stock - resQ,
                    warehouse_name: p.warehouse || 'Principal'
                };
            });
            res.setHeader('Content-Type', 'application/json');
            return res.send(JSON.stringify(mappedProducts));
        }
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Error al obtener productos" });
    }
});

// Ruta para catálogo de productos (Orígenes)
app.get('/api/catalog', async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(products);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Ruta para actualizar origen de producto
app.put('/api/catalog/:internal_id/origin', async (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Sesión no válida" });

    const { internal_id } = req.params;
    const { originWarehouse } = req.body;
    try {
        const updated = await prisma.product.update({
            where: { internal_id },
            data: { originWarehouse: originWarehouse || null }
        });
        res.json({ success: true, product: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Ruta para importación masiva de orígenes
app.post('/api/catalog/import-origins', async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, error: "Datos de importación inválidos." });
    }

    try {
        let updatedCount = 0;
        for (const item of items) {
            const { internal_id, originWarehouse } = item;
            if (internal_id) {
                // Verificar si existe el producto para evitar fallar
                const exists = await prisma.product.findUnique({
                    where: { internal_id: String(internal_id) }
                });
                if (exists) {
                    await prisma.product.update({
                        where: { internal_id: String(internal_id) },
                        data: { originWarehouse: originWarehouse || null }
                    });
                    updatedCount++;
                }
            }
        }
        res.json({ success: true, message: `Se actualizaron los orígenes de ${updatedCount} productos.` });
    } catch (e) {
        console.error("Error al importar orígenes:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Ruta para agregar una cotización específica
app.post('/api/add-quotation', (req, res) => {
    const { quotationNumber } = req.body;

    // Validar el formato
    if (!quotationNumber || !/^\d+$/.test(quotationNumber)) {
        return res.status(400).json({ success: false, error: "Número de cotización no válido." });
    }

    console.log(`🚀 Iniciando extracción de cotización ${quotationNumber}...`);

    const creds = getSavedCredentials();
    if (!creds.ventasEmail || !creds.ventasPassword) {
        return res.status(400).json({ success: false, error: "Faltan configurar las credenciales de Ventas/Administrador." });
    }

    const env = { ...process.env, API_EMAIL: creds.ventasEmail, API_PASSWORD: creds.ventasPassword };

    exec(`node scripts/extraer_cotizacion.js ${quotationNumber}`, { env }, (error, stdout, stderr) => {
        if (stdout) console.log(`[Script stdout]:\n${stdout}`);
        if (stderr) console.error(`[Script stderr]:\n${stderr}`);
        
        if (error) {
            console.error(`❌ Error: ${error.message}`);
            
            // Extraer el mensaje específico del error
            let userError = "Error interno al extraer la cotización o credenciales inválidas.";
            if (stdout.includes("El usuario no tiene permisos")) {
                userError = "No tienes permisos para ver esta cotización.";
            } else if (stdout.includes("Cotización no encontrada")) {
                userError = "La cotización no existe o no se puede acceder.";
            } else if (stdout.includes("Credenciales invalidas") || error.message.includes("Credenciales invalidas")) {
                userError = "Credenciales de Ventas/Administrador vencidas o incorrectas.";
            }

            return res.status(500).json({ success: false, error: userError });
        }
        res.json({ success: true, message: `Cotización ${quotationNumber} agregada correctamente.` });
    });
});

// Ruta para sincronizar facturas de forma masiva
app.post('/api/sync-invoices', async (req, res) => {
    console.log("🚀 Iniciando sincronización masiva de facturas...");

    const creds = getSavedCredentials();
    if (!creds.ventasEmail || !creds.ventasPassword) {
        return res.status(400).json({ success: false, error: "Faltan configurar las credenciales de Ventas/Administrador." });
    }

    const env = { ...process.env, API_EMAIL: creds.ventasEmail, API_PASSWORD: creds.ventasPassword };

    exec('node scripts/sync_facturados.js', { env }, (error, stdout, stderr) => {
        if (stdout) console.log(`[Sync stdout]:\n${stdout}`);
        if (stderr) console.error(`[Sync stderr]:\n${stderr}`);
        
        if (error) {
            console.error(`❌ Error en sincronización: ${error.message}`);
            return res.status(500).json({ success: false, error: "Error al sincronizar facturas. Verifica las credenciales de Ventas." });
        }
        
        const match = stdout.match(/FACTURADO:\s(\d+)/);
        const updatedCount = match ? match[1] : 0;
        
        res.json({ success: true, updatedCount });
    });
});

// Obtener todas las cotizaciones (sin los items, para que sea rápido)
app.get('/api/quotations', async (req, res) => {
    try {
        const quotations = await prisma.quotation.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(quotations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ruta para eliminar una cotización
app.delete('/api/quotations/:number', async (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Sesión no válida" });

    const { number } = req.params;
    const fullNumber = number.includes('COT-') ? number : `COT-${number}`;

    try {
        const quotation = await prisma.quotation.findUnique({ where: { number: fullNumber } });
        if (!quotation) {
            return res.status(404).json({ success: false, error: "Cotización no encontrada en el sistema local." });
        }

        // Primero borramos los items asociados (QuotationItem)
        await prisma.quotationItem.deleteMany({
            where: { quotationId: quotation.id }
        });

        // Luego borramos la cotización (Quotation)
        await prisma.quotation.delete({
            where: { id: quotation.id }
        });

        res.json({ success: true, message: `Cotización ${fullNumber} eliminada correctamente.` });
    } catch (error) {
        console.error("Error al eliminar cotización:", error);
        res.status(500).json({ success: false, error: "Error interno al eliminar la cotización." });
    }
});

// Ruta para cambiar estado de cotización
app.put('/api/quotations/:id/status', async (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Sesión no válida" });

    const { id } = req.params;
    const { status } = req.body;

    if (!['PENDIENTE', 'RESERVADO', 'FACTURADO'].includes(status)) {
        return res.status(400).json({ success: false, error: "Estado no válido" });
    }

    try {
        const updated = await prisma.quotation.update({
            where: { id },
            data: { status }
        });
        res.json({ success: true, quotation: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ruta para obtener almacenes
app.get('/api/warehouses', async (req, res) => {
    try {
        const warehouses = await prisma.warehouse.findMany({
            orderBy: { id: 'asc' }
        });
        res.json(warehouses);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Ruta para actualizar el alias de un almacén
app.put('/api/warehouses/:id', async (req, res) => {
    const user = getUser(req);
    if (!user) return res.status(401).json({ success: false, message: "Sesión no válida" });

    const { id } = req.params;
    const { alias } = req.body;

    try {
        const updated = await prisma.warehouse.update({
            where: { id: parseInt(id) },
            data: { alias }
        });
        res.json({ success: true, warehouse: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Ruta para registrar un ingreso (transaction)
app.post('/api/add-transaction', async (req, res) => {
    const { item_id, warehouse_id, quantity, inventory_transaction_id, comments } = req.body;

    if (!item_id || !warehouse_id || !quantity) {
        return res.status(400).json({ success: false, error: "Faltan datos obligatorios" });
    }

    const creds = getSavedCredentials();
    if (!creds.almacenEmail || !creds.almacenPassword) {
        return res.status(400).json({ success: false, error: "Faltan configurar las credenciales de Almacén." });
    }

    try {
        await login(creds.almacenEmail, creds.almacenPassword);

        // 1. Obtener la página de inventario para capturar el token CSRF actualizado después del login
        const invPage = await client.get('/inventory');
        const $ = cheerio.load(invPage.data);
        const csrfToken = $('meta[name="csrf-token"]').attr('content') || $('input[name="_token"]').val();

        if (!csrfToken) {
            throw new Error("No se pudo obtener el token CSRF de la sesión.");
        }

        const payload = {
            id: null,
            item_id: parseInt(item_id),
            warehouse_id: parseInt(warehouse_id),
            inventory_transaction_id: inventory_transaction_id || "19",
            quantity: parseFloat(quantity),
            type: "input",
            lot_code: null,
            lots_enabled: false,
            series_enabled: false,
            lots: [],
            date_of_due: null,
            created_at: null,
            comments: comments || null
        };

        const response = await client.post('/inventory/transaction', payload, {
            headers: {
                'X-CSRF-TOKEN': csrfToken,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (response.data && response.data.success !== false) {
            res.json({ success: true, message: "Ingreso registrado correctamente." });
        } else {
            res.status(400).json({ success: false, error: response.data.message || "Error al registrar ingreso." });
        }
    } catch (error) {
        if (error.message === "Credenciales inválidas") {
            return res.status(401).json({ success: false, error: "Credenciales de Almacén incorrectas o vencidas en Configuración." });
        }
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Permite que la web consulte los datos de la cotización
app.get('/api/quotations/:number', async (req, res) => {
    try {
        const { number } = req.params;

        // Buscamos la cotización y usamos el internal_id para traer el stock de la tabla Product
        const quotation = await prisma.quotation.findUnique({
            where: { number: number },
            include: { items: true }
        });

        if (!quotation) return res.status(404).json({ error: "Cotización no encontrada" });

        // Calcular reservas globales
        const reservedItems = await prisma.quotationItem.findMany({
            where: { quotation: { status: 'RESERVADO' } }
        });
        const reservationMap = {};
        reservedItems.forEach(item => {
            reservationMap[item.productId] = (reservationMap[item.productId] || 0) + item.quantity;
        });

        // Obtener todos los almacenes de la BD para identificar cuáles son "Ventas" (y excluirlos)
        const dbWarehouses = await prisma.warehouse.findMany();
        const ventasNames = dbWarehouses
            .filter(w => {
                const aliasLower = (w.alias || '').toLowerCase();
                const nameLower = (w.name || '').toLowerCase();
                return aliasLower === 'ventas' || nameLower.includes('principal') || nameLower.includes('ventas');
            })
            .map(w => w.name);

        // Por si acaso, si no hay almacenes registrados en la BD local, usamos el por defecto de Ventas
        if (ventasNames.length === 0) {
            ventasNames.push("Almacén - Almacén principal");
        }

        // Calcular stock disponible (excluyendo almacenes de Ventas, sólo secundarios como 2do Piso, etc.)
        const jsonPath = path.join(__dirname, 'product.json');
        const stockMap = {};
        if (fs.existsSync(jsonPath)) {
            const dataArray = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            dataArray.forEach(p => {
                const whName = p.warehouse_name || '';
                const isVentas = ventasNames.some(vn => vn.toLowerCase() === whName.toLowerCase()) ||
                                 whName.toLowerCase().includes('principal') ||
                                 whName.toLowerCase().includes('ventas');
                if (!isVentas) {
                    stockMap[p.internal_id] = (stockMap[p.internal_id] || 0) + p.stock;
                }
            });
        } else {
            const dbProducts = await prisma.product.findMany();
            dbProducts.forEach(p => {
                const whName = p.warehouse || '';
                const isVentas = ventasNames.some(vn => vn.toLowerCase() === whName.toLowerCase()) ||
                                 whName.toLowerCase().includes('principal') ||
                                 whName.toLowerCase().includes('ventas');
                if (!isVentas) {
                    stockMap[p.internal_id] = p.stock;
                } else {
                    stockMap[p.internal_id] = 0;
                }
            });
        }

        // Mapeamos los items para calcular su estado real
        const itemsSincerados = quotation.items.map(item => {
            const stockTotal = stockMap[item.productId] || 0;
            const reservaGlobal = reservationMap[item.productId] || 0;
            const stockDispGlobal = stockTotal - reservaGlobal;

            // Si esta cotización YA ESTÁ reservada, su cantidad es parte de "reservaGlobal",
            // así que para evaluar si se puede cumplir, "le devolvemos" su propia cantidad al disponible
            const miReserva = (quotation.status === 'RESERVADO') ? item.quantity : 0;
            const stockDisponibleParaMi = stockDispGlobal + miReserva;

            return {
                ...item,
                stockTotal,
                reservaGlobal,
                stockDispGlobal,
                stockDisponibleParaMi
            };
        });

        res.json({ ...quotation, items: itemsSincerados });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`🌐 Servidor de Volper Seal corriendo en http://localhost:${port}`);
});