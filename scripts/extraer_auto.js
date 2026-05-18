require('dotenv').config();
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// 1. Configuramos el "Tarro de Cookies" para que la sesión se mantenga activa
const jar = new CookieJar();
const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    baseURL: 'https://volperseal.goldensystem.com.pe'
}));

async function iniciarMision() {
    try {
        console.log("--- 🕵️ Paso 1: Obteniendo página de login y Token CSRF ---");
        const loginPage = await client.get('/login');
        const $ = cheerio.load(loginPage.data);

        // Laravel siempre pone el token en un input oculto
        const csrfToken = $('input[name="_token"]').val();
        if (!csrfToken) throw new Error("No se pudo extraer el Token CSRF. Revisa la URL.");
        console.log("✅ Token obtenido:", csrfToken);

        const email = process.env.API_EMAIL;
        const password = process.env.API_PASSWORD;

        if (!email || !password) {
            throw new Error("Las credenciales (API_EMAIL, API_PASSWORD) no están definidas.");
        }

        console.log("--- 🔑 Paso 2: Autenticando en Volper Seal ---");
        const loginResponse = await client.post('/login', new URLSearchParams({
            '_token': csrfToken,
            'email': email,
            'password': password
        }));

        const finalUrl = loginResponse.request.res ? loginResponse.request.res.responseUrl : loginResponse.request.path;
        if (finalUrl && finalUrl.endsWith('/login')) {
             throw new Error("Credenciales invalidas");
        }
        console.log("✅ Sesión iniciada con éxito.");

        console.log("--- 🔄 Paso 3: Iniciando extracción masiva (35 páginas aprox.) ---");

        let todosLosProductos = [];
        let paginaActual = 1;
        let hayMasPaginas = true;

        while (hayMasPaginas) {
            // Usamos la URL que identificaste en el navegador
            // La URL obtiene los datos de todos los almacenes
            const url = `/inventory/report/records?active&brand_id&category_id&filter=01&page=${paginaActual}&warehouse_id=all`;

            const response = await client.get(url);
            const data = response.data.data;

            if (data && data.length > 0) {
                todosLosProductos = todosLosProductos.concat(data);
                console.log(`📥 Página ${paginaActual} extraída (${todosLosProductos.length} productos acumulados)`);

                // Leemos el total de páginas desde la metadata de la API
                const totalPaginas = response.data.meta.last_page;

                if (paginaActual < totalPaginas) {
                    paginaActual++;
                } else {
                    hayMasPaginas = false; // Llegamos al final
                }
            } else {
                hayMasPaginas = false;
            }
        }

        console.log(`✅ ¡Misión completa! Total final: ${todosLosProductos.length} productos.`);

        // 4. Guardar TODO el array masivo en la raíz del proyecto
        const jsonPath = path.join(__dirname, '../product.json');
        fs.writeFileSync(jsonPath, JSON.stringify(todosLosProductos, null, 2));
        console.log("💾 Archivo 'product.json' actualizado con la base de datos completa.");
    } catch (error) {
        console.error("❌ Fallo en la extracción automática:", error.message);
        if (error.response) console.error("Respuesta del servidor:", error.response.status);
    }
}

iniciarMision();
