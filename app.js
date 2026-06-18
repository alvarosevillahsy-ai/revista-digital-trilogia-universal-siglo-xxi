pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let flipBook = null;
let db = null;
const NOMBRE_DB = "PlataformaEditorialDB";
const STORE_DB = "RevistasStore";

// 1. INICIALIZAR BASE DE DATOS LOCAL AL CARGAR LA PÁGINA
const requestDB = indexedDB.open(NOMBRE_DB, 1);

requestDB.onupgradeneeded = function(e) {
    let database = e.target.result;
    if (!database.objectStoreNames.contains(STORE_DB)) {
        database.createObjectStore(STORE_DB, { keyPath: "id" });
    }
};

requestDB.onsuccess = function(e) {
    db = e.target.result;
    verificarYLimpiarRevistaPublicada(); // Buscar si hay una revista en línea previamente guardada
};

requestDB.onerror = function() {
    console.error("Error al conectar con la base de datos local.");
};

// Escuchador para cargar un nuevo archivo PDF
document.getElementById('cargar-pdf').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.type === "application/pdf") {
        const fileReader = new FileReader();
        fileReader.onload = function() {
            const typedarray = new Uint8Array(this.result);
            publicarRevistaEnLinea(typedarray);
        };
        fileReader.readAsArrayBuffer(file);
    }
});

// Guardar el PDF de forma permanente en la base de datos del navegador
function publicarRevistaEnLinea(bufferArray) {
    const transaccion = db.transaction([STORE_DB], "readwrite");
    const almacén = transaccion.objectStore(STORE_DB);
    
    const registroRevista = {
        id: "revista_activa",
        datos: bufferArray,
        fecha: new Date().toLocaleDateString()
    };

    const solicitudGuardar = almacén.put(registroRevista);

    solicitudGuardar.onsuccess = function() {
        procesarYRenderizarPDF(bufferArray, true);
    };
}

// Verificar si ya existe un documento publicado en el sistema
function verificarYLimpiarRevistaPublicada() {
    const transaccion = db.transaction([STORE_DB], "readonly");
    const almacén = transaccion.objectStore(STORE_DB);
    const solicitudLeer = almacén.get("revista_activa");

    solicitudLeer.onsuccess = function(e) {
        if (solicitudLeer.result) {
            // Existe una revista publicada, se renderiza de inmediato en línea
            procesarYRenderizarPDF(solicitudLeer.result.datos, true);
        }
    };
}

// 2. MOTOR GRÁFICO DE LA REVISTA (Optimizado para Computadora y Celular)
async function procesarYRenderizarPDF(data, esPublicado) {
    const elRevista = document.getElementById('revista-interactiva');
    const pantallaVacia = document.getElementById('pantalla-vacia');
    const tagEstado = document.getElementById('estado-publicacion');
    
    elRevista.innerHTML = ''; 
    pantallaVacia.classList.add('hidden');
    elRevista.classList.remove('hidden');
    elRevista.style.transform = "scale(1)"; 

    if(esPublicado) {
        tagEstado.innerText = "Publicado en Línea";
        tagEstado.classList.add('publicado');
    }

    try {
        const pdf = await pdfjsLib.getDocument(data).promise;
        const totalPaginas = pdf.numPages;

        const zonaLectura = document.querySelector('.zona-lectura');
        const anchoDisponibleMax = zonaLectura.clientWidth - 20;
        const altoDisponibleMax = zonaLectura.clientHeight - 20;

        // DETECTAR SI ES CELULAR
        const esMovil = window.innerWidth <= 768;

        const primeraPagina = await pdf.getPage(1);
        const viewportOriginal = primeraPagina.getViewport({ scale: 1.0 });

        let escalaOptima;
        let anchoPaginaPx;
        let altoPaginaPx;

        if (esMovil) {
            // Modo Celular: Ocupar el ancho disponible con una sola página completa
            escalaOptima = anchoDisponibleMax / viewportOriginal.width;
            anchoPaginaPx = Math.floor(viewportOriginal.width * escalaOptima);
            altoPaginaPx = Math.floor(viewportOriginal.height * escalaOptima);
            
            // Contenedor rígido de UNA sola página para pantallas móviles
            elRevista.style.width = `${anchoPaginaPx}px`;
        } else {
            // Modo Computadora: Vista clásica de doble página abierta
            const escalaAncho = (anchoDisponibleMax / 2) / viewportOriginal.width;
            const escalaAlto = altoDisponibleMax / viewportOriginal.height;
            escalaOptima = Math.min(escalaAncho, escalaAlto);
            
            anchoPaginaPx = Math.floor(viewportOriginal.width * escalaOptima);
            altoPaginaPx = Math.floor(viewportOriginal.height * escalaOptima);
            
            // Contenedor rígido de DOS páginas juntas
            elRevista.style.width = `${anchoPaginaPx * 2}px`;
        }

        elRevista.style.height = `${altoPaginaPx}px`;

        for (let num = 1; num <= totalPaginas; num++) {
            const pagina = await pdf.getPage(num);
            const viewport = pagina.getViewport({ scale: escalaOptima });

            const divPagina = document.createElement('div');
            divPagina.className = 'pagina-renderizada';
            divPagina.style.width = `${anchoPaginaPx}px`;
            divPagina.style.height = `${altoPaginaPx}px`;
            
            const canvas = document.createElement('canvas');
            const contexto = canvas.getContext('2d');
            canvas.height = altoPaginaPx;
            canvas.width = anchoPaginaPx;

            divPagina.appendChild(canvas);
            elRevista.appendChild(divPagina);

            await pagina.render({ canvasContext: contexto, viewport: viewport }).promise;
        }

        const opcionesFlipbook = {
            width: anchoPaginaPx,
            height: altoPaginaPx,
            size: "fixed",
            disabledSpineRendering: esMovil, // Quita el lomo del libro si es celular
            drawShadow: true, 
            showCover: !esMovil, // Desactiva comportamiento complejo de portada en celular
            fixedOnCanvas: true, 
            usePortrait: esMovil, // Forzar vista vertical (Retrato) si es celular
            flippingTime: 700 
        };

        if (flipBook) { flipBook.destroy(); } 

        if (typeof pageFlip !== 'undefined' && pageFlip.PageFlip) {
            flipBook = new pageFlip.PageFlip(elRevista, opcionesFlipbook);
        } else if (typeof St !== 'undefined' && St.PageFlip) {
            flipBook = new St.PageFlip(elRevista, opcionesFlipbook);
        }

        flipBook.loadFromHTML(document.querySelectorAll('.pagina-renderizada'));
        configurarControlesInterfaz(totalPaginas);

    } catch (error) {
        console.error("Error al procesar la revista: ", error);
    }
}
    
    elRevista.innerHTML = ''; 
    pantallaVacia.classList.add('hidden');
    elRevista.classList.remove('hidden');
    elRevista.style.transform = "scale(1)"; 

    if(esPublicado) {
        tagEstado.innerText = "Publicado en Línea";
        tagEstado.classList.add('publicado');
    }

    try {
        const pdf = await pdfjsLib.getDocument(data).promise;
        const totalPaginas = pdf.numPages;

        const zonaLectura = document.querySelector('.zona-lectura');
        const anchoDisponibleMax = zonaLectura.clientWidth - 40;
        const altoDisponibleMax = zonaLectura.clientHeight - 40;

        const primeraPagina = await pdf.getPage(1);
        const viewportOriginal = primeraPagina.getViewport({ scale: 1.0 });

        const escalaAncho = (anchoDisponibleMax / 2) / viewportOriginal.width;
        const escalaAlto = altoDisponibleMax / viewportOriginal.height;
        const escalaOptima = Math.min(escalaAncho, escalaAlto);

        const anchoPaginaPx = Math.floor(viewportOriginal.width * escalaOptima);
        const altoPaginaPx = Math.floor(viewportOriginal.height * escalaOptima);

        // Contenedor rígido doble permanente para evitar desvíos o brincos
        elRevista.style.width = `${anchoPaginaPx * 2}px`;
        elRevista.style.height = `${altoPaginaPx}px`;

        for (let num = 1; num <= totalPaginas; num++) {
            const pagina = await pdf.getPage(num);
            const viewport = pagina.getViewport({ scale: escalaOptima });

            const divPagina = document.createElement('div');
            divPagina.className = 'pagina-renderizada';
            divPagina.style.width = `${anchoPaginaPx}px`;
            divPagina.style.height = `${altoPaginaPx}px`;
            
            const canvas = document.createElement('canvas');
            const contexto = canvas.getContext('2d');
            canvas.height = altoPaginaPx;
            canvas.width = anchoPaginaPx;

            divPagina.appendChild(canvas);
            elRevista.appendChild(divPagina);

            await pagina.render({ canvasContext: contexto, viewport: viewport }).promise;
        }

        const opcionesFlipbook = {
            width: anchoPaginaPx,
            height: altoPaginaPx,
            size: "fixed",
            disabledSpineRendering: false, 
            drawShadow: true, 
            showCover: true, 
            fixedOnCanvas: true, // Portada centrada estática interna
            usePortrait: false, 
            flippingTime: 700 
        };

        if (flipBook) { flipBook.destroy(); } // Destruir instancia previa si se cambia la revista

        if (typeof pageFlip !== 'undefined' && pageFlip.PageFlip) {
            flipBook = new pageFlip.PageFlip(elRevista, opcionesFlipbook);
        } else if (typeof St !== 'undefined' && St.PageFlip) {
            flipBook = new St.PageFlip(elRevista, opcionesFlipbook);
        }

        flipBook.loadFromHTML(document.querySelectorAll('.pagina-renderizada'));
        configurarControlesInterfaz(totalPaginas);

    } catch (error) {
        console.error("Error al procesar la revista: ", error);
    }
}

// 3. LOGÍSITICA DE BOTONES AVANZADOS Y COMPARTIR EN REDES
function configurarControlesInterfaz(totalPaginas) {
    const btnInicio = document.getElementById('btn-inicio');
    const btnAnterior = document.getElementById('btn-anterior');
    const btnSiguiente = document.getElementById('btn-siguiente');
    const btnFinal = document.getElementById('btn-final');
    const textoPaginas = document.getElementById('control-paginas');
    const selectorZoom = document.getElementById('selector-zoom');
    const btnCompartir = document.getElementById('btn-compartir');
    const menuRedes = document.getElementById('menu-redes');
    const elRevista = document.getElementById('revista-interactiva');
    const zonaLectura = document.querySelector('.zona-lectura');

    // Activar todos los controles operativos
    btnInicio.disabled = false;
    btnAnterior.disabled = false;
    btnSiguiente.disabled = false;
    btnFinal.disabled = false;
    selectorZoom.disabled = false;
    btnCompartir.disabled = false;
    selectorZoom.value = "100"; 

    textoPaginas.innerText = `Página: 1 / ${totalPaginas}`;

    flipBook.on('flip', (e) => {
        const indexActual = e.data;
        if (indexActual === 0) {
            textoPaginas.innerText = `Página: 1 / ${totalPaginas}`;
        } else if (indexActual >= totalPaginas - 1 && totalPaginas % 2 === 0) {
            textoPaginas.innerText = `Página: ${totalPaginas} / ${totalPaginas}`;
        } else {
            const dePagina = indexActual + 1;
            const aPagina = Math.min(indexActual + 2, totalPaginas);
            textoPaginas.innerText = `Páginas: ${dePagina}-${aPagina} / ${totalPaginas}`;
        }
    });

    // Operaciones de Navegación Estándar
    btnAnterior.onclick = () => { flipBook.flipPrev(); };
    btnSiguiente.onclick = () => { flipBook.flipNext(); };

    // NUEVO: Funciones de Salto Directo Solicitadas
    btnInicio.onclick = () => { flipBook.turnToPage(0); }; // Salto directo a Portada (Apertura)
    btnFinal.onclick = () => { flipBook.turnToPage(totalPaginas - 1); }; // Salto directo a Contraportada (Cierre)

    // Lógica del Zoom
    selectorZoom.onchange = (e) => {
        const porcentaje = parseInt(e.target.value);
        const escala = porcentaje / 100;
        elRevista.style.transform = `scale(${escala})`;
        zonaLectura.style.alignItems = porcentaje > 100 ? 'flex-start' : 'center';
    };

    // NUEVO: Menú Desplegable Compartir Redes Sociales
    btnCompartir.onclick = (e) => {
        e.stopPropagation();
        menuRedes.classList.toggle('hidden');
    };

    document.onclick = () => { menuRedes.classList.add('hidden'); }; // Cerrar menú al hacer clic fuera

    // Configuración de Enlaces de Redes Sociales Dinámicas
    const urlCompartir = encodeURIComponent(window.location.href);
    const mensajeCompartir = encodeURIComponent("¡Te invito a leer nuestra última edición de la revista digital interactiva!");

    document.getElementById('share-fb').href = `https://www.facebook.com/sharer/sharer.php?u=${urlCompartir}`;
    document.getElementById('share-wa').href = `https://api.whatsapp.com/send?text=${mensajeCompartir}%20${urlCompartir}`;
    document.getElementById('share-tx').href = `https://twitter.com/intent/tweet?url=${urlCompartir}&text=${mensajeCompartir}`;
    document.getElementById('share-tg').href = `https://telegram.me/share/url?url=${urlCompartir}&text=${mensajeCompartir}`;

    document.getElementById('share-copy').onclick = () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            alert("¡Enlace de la revista copiado al portapapeles con éxito!");
        });
    };
}