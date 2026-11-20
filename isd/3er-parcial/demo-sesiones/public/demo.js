// La página solo hace fetch a la API. El navegador manda la cookie solo (misma página, mismo servidor).
// Este archivo se carga al FINAL del <body> (index.html), así que cuando corre ya existen todos los
// elementos de la página: por eso no hace falta esperar a DOMContentLoaded.
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------------------------
// Etapa 1 · Una sola función para hablar con la API.
// Por qué: todas las peticiones necesitan lo mismo (método, encabezado JSON si hay cuerpo, leer el
// código y el JSON). Si lo escribo una vez, no se me olvida en ningún botón.
// - fetch NO lanza error con 401/403/500: el código viene en respuesta.status, así que lo regreso.
// - Content-Type: application/json solo cuando hay cuerpo; sin él express.json() no lee req.body.
// - No uso credentials: 'include' porque la página y la API están en el mismo origen
//   (localhost:4600) y fetch ya manda la cookie. Haría falta si la página estuviera en otro puerto
//   (por ejemplo Next.js en :3000 llamando a la API en :4600), junto con CORS en el servidor.
// ---------------------------------------------------------------------------------------------
async function llamar(metodo, url, cuerpo) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(url, opciones);
  } catch (error) {
    // Aquí solo se llega si no hubo respuesta (servidor apagado, sin red). Lo trato como código 0.
    return { status: 0, datos: { error: `No se pudo conectar con el servidor (${error.message})` } };
  }

  // Si la respuesta no es JSON (un error raro, una página HTML), datos queda en null en vez de tronar.
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }
  return { status: respuesta.status, datos };
}

// ---------------------------------------------------------------------------------------------
// Etapa 2 · La bitácora.
// Por qué: quiero ver cada respuesta del servidor sin abrir Network, con la más nueva arriba
// (prepend la inserta como primer hijo de la <ol>).
// Uso textContent y NO innerHTML: el JSON trae texto que escribió alguien (un nombre, por ejemplo).
// Con innerHTML, un "nombre" como <img src=x onerror=...> se ejecutaría (XSS) y, si la cookie no
// fuera httpOnly, ese script podría leer document.cookie y robar la sesión.
// ---------------------------------------------------------------------------------------------
function claseDelCodigo(status) {
  if (status >= 200 && status < 300) return 'codigo ok';
  if (status === 401) return 'codigo e401';
  if (status === 403) return 'codigo e403';
  return 'codigo error';
}

function anotar(metodo, url, status, datos) {
  const li = document.createElement('li');

  const codigo = document.createElement('span');
  codigo.className = claseDelCodigo(status);
  codigo.textContent = status;

  const pedido = document.createElement('strong');
  pedido.textContent = ` ${metodo} ${url}`;

  const json = document.createElement('pre');
  json.textContent = JSON.stringify(datos, null, 2);

  li.append(codigo, pedido, json);
  $('bitacora').prepend(li);
}

// ---------------------------------------------------------------------------------------------
// Etapa 3 · ¿Quién soy para el servidor?
// Por qué: la página no puede "saber" si hay sesión mirando la cookie (es httpOnly y además solo
// es un id). La única fuente de verdad es preguntarle al servidor con GET /api/sesion.
// Luego muestro document.cookie: con httpOnly: true sale vacío aunque SÍ haya sesión, porque el
// navegador guarda la cookie pero no se la deja leer al JavaScript.
// ---------------------------------------------------------------------------------------------
async function mostrarEstado() {
  const { status, datos } = await llamar('GET', '/api/sesion');
  const estado = $('estado');

  if (status === 200 && datos && datos.usuario) {
    const { nombre, rol } = datos.usuario;
    estado.textContent = `Con sesión: ${nombre} (${rol}) · sesión ${datos.sesion} · vence en ${datos.expiraEnSegundos} s`;
    estado.className = 'estado con-sesion';
  } else {
    estado.textContent = status === 0 ? 'Sin conexión con el servidor' : `Sin sesión (el servidor responde ${status})`;
    estado.className = 'estado sin-sesion';
  }

  $('cookie-js').textContent = document.cookie || '(vacío)';
}

// ---------------------------------------------------------------------------------------------
// Tarjeta 6 · El token (JWT) de la sesión.
// Por qué: al iniciar sesión el servidor firma un JWT y lo guarda dentro de tu sesión. Con la cookie
// de la sesión se pide ese token (Obtener), se cambia por uno nuevo (Renovar) y se prueba él solo,
// SIN la cookie, para ver si el servidor lo acepta (Comprobar).
// ---------------------------------------------------------------------------------------------
let tokenActual = null; // se conserva tras el logout para poder comprobar que quedó revocado
let relojToken = null; // intervalo de la cuenta regresiva

function estadoToken(texto, clase) {
  $('token-estado').textContent = texto;
  $('token-estado').className = `estado ${clase}`;
}

// El token con sus tres partes de colores: encabezado · payload · firma.
function pintarToken() {
  const caja = $('token-visible');
  caja.replaceChildren();
  if (!tokenActual) {
    caja.textContent = '(inicia sesión y pulsa "Obtener token")';
    return;
  }
  const [header, payload, firma] = tokenActual.split('.');
  const pedazo = (texto, clase) => {
    const span = document.createElement('span');
    span.className = clase;
    span.textContent = texto;
    return span;
  };
  caja.append(
    pedazo(header, 't-header'), pedazo('.', 't-punto'),
    pedazo(payload, 't-payload'), pedazo('.', 't-punto'),
    pedazo(firma, 't-firma'),
  );
}

// Cuenta regresiva hasta el exp del token (local: no le pregunta al servidor cada segundo).
function contarHasta(expiraEn, texto) {
  clearInterval(relojToken);
  const pintar = () => {
    const quedan = Math.max(0, Math.round((Date.parse(expiraEn) - Date.now()) / 1000));
    if (quedan === 0) {
      clearInterval(relojToken);
      estadoToken('El token ya venció (exp): pulsa "Renovar token"', 'vencida');
      return;
    }
    estadoToken(`${texto} · vence en ${quedan} s`, 'con-sesion');
  };
  pintar();
  relojToken = setInterval(pintar, 1000);
}

// En la bitácora no repito el token completo ni el payload (el token ya se ve en la tarjeta 6).
function recortar(datos) {
  if (!datos) return datos;
  const corto = (t) => (typeof t === 'string' ? `${t.slice(0, 20)}…` : t);
  const copia = { ...datos, token: corto(datos.token), payload: undefined };
  if (datos.jwt) copia.jwt = { ...datos.jwt, token: corto(datos.jwt.token), payload: undefined };
  return copia;
}

function sinSesion(status) {
  clearInterval(relojToken);
  estadoToken(`No hay sesión (${status}): inicia sesión para obtener el token`, 'sin-sesion');
}

// Obtener: con la cookie de la sesión, el servidor entrega el token que guardó en ella.
async function obtenerToken() {
  const { status, datos } = await llamar('GET', '/api/sesion/token');
  anotar('GET', '/api/sesion/token', status, recortar(datos));
  if (status !== 200) return sinSesion(status);
  tokenActual = datos.token;
  pintarToken();
  if (datos.estado !== 'activa') {
    clearInterval(relojToken);
    return estadoToken(`El token de tu sesión está ${datos.estado}: pulsa "Renovar token"`, datos.estado === 'vencida' ? 'vencida' : 'sin-sesion');
  }
  return contarHasta(datos.expiraEn, `Token de tu sesión ${datos.sesion}`);
}

// Renovar: el servidor firma un token nuevo para la sesión y revoca el anterior.
async function renovarToken() {
  const { status, datos } = await llamar('POST', '/api/sesion/token');
  anotar('POST', '/api/sesion/token', status, recortar(datos));
  if (status !== 200) return sinSesion(status);
  tokenActual = datos.jwt.token;
  pintarToken();
  mostrarListaNegra(); // el token anterior acaba de entrar a la lista negra
  return contarHasta(datos.jwt.expiraEn, `Token renovado ${datos.jwt.sesion}${datos.anteriorRevocado ? ' (el anterior quedó revocado)' : ''}`);
}

// Comprobar: manda el token en Authorization y con credentials: 'omit' (SIN la cookie). Así se prueba
// el token por sí solo: el servidor revisa su firma, su exp y la lista negra.
async function comprobarToken() {
  if (!tokenActual) return estadoToken('Primero pulsa "Obtener token"', 'sin-sesion');
  const url = '/api/jwt/sesion';
  let status = 0;
  let datos = null;
  try {
    const respuesta = await fetch(url, { credentials: 'omit', headers: { Authorization: `Bearer ${tokenActual}` } });
    status = respuesta.status;
    datos = await respuesta.json();
  } catch (error) {
    datos = { error: error.message };
  }
  anotar('GET', `${url} (Bearer, sin cookie)`, status, recortar(datos));
  mostrarListaNegra(); // si salió "revocado", aquí se ve su fila marcada como "(el tuyo)"
  if (status === 200) {
    return contarHasta(datos.expiraEn, `✔ Token válido: ${datos.usuario.nombre} (${datos.usuario.rol})`);
  }
  clearInterval(relojToken);
  return estadoToken(`✘ Token NO válido: ${datos && datos.error ? datos.error : `código ${status}`}`, 'sin-sesion');
}

// ---------------------------------------------------------------------------------------------
// Etapa 4 · Lo que guarda el servidor (solo para la clase).
// Por qué: así se ve que los datos (usuario, visitas) viven en el servidor y no en la cookie.
// Vacío el <tbody> antes de llenarlo (replaceChildren) para que, al pulsar varias veces, las
// filas no se dupliquen. Las celdas van con textContent por la misma razón que la bitácora.
// expira llega como texto ISO (UTC): new Date(...).toLocaleTimeString() lo pasa a hora local.
// ---------------------------------------------------------------------------------------------
function celda(texto) {
  const td = document.createElement('td');
  td.textContent = texto;
  return td;
}

async function mostrarSesiones() {
  const { status, datos } = await llamar('GET', '/api/diagnostico/sesiones');
  const tabla = $('tabla-sesiones');
  tabla.replaceChildren();

  if (status !== 200 || !datos) {
    $('donde').textContent = `No se pudo leer el almacén (código ${status})`;
    const tr = document.createElement('tr');
    const td = celda('(sin datos)');
    td.colSpan = 4;
    tr.append(td);
    tabla.append(tr);
    return;
  }

  $('donde').textContent =
    datos.almacen === 'memoria'
      ? 'En la MEMORIA del servidor (se pierden al reiniciar)'
      : 'En MySQL, tabla sessions (sobreviven a un reinicio del servidor)';

  if (!datos.sesiones || datos.sesiones.length === 0) {
    const tr = document.createElement('tr');
    const td = celda('(sin sesiones)');
    td.colSpan = 4;
    tr.append(td);
    tabla.append(tr);
    return;
  }

  for (const s of datos.sesiones) {
    const tr = document.createElement('tr');
    if (s.esLaTuya) tr.className = 'tuya';
    const vence = s.expira ? new Date(s.expira).toLocaleTimeString() : '—';
    tr.append(
      celda(s.esLaTuya ? `${s.sesion} (la tuya)` : s.sesion),
      celda(s.usuario || '(sin usuario)'),
      celda(String(s.visitas)),
      celda(vence),
    );
    tabla.append(tr);
  }
}

// Por qué: después de CUALQUIER acción el estado y la tabla pueden haber cambiado; una sola
// función evita olvidar refrescar alguna de las dos. Van en paralelo porque no dependen entre sí.
// ---------------------------------------------------------------------------------------------
// Tarjeta 7 · Lista negra (tokens revocados).
// Por qué: con JWT el servidor no guarda las sesiones; lo único que guarda es qué tokens ya no acepta.
// Se actualiza sola después de cada acción (refrescarTodo) y al renovar el token.
// Si el token que muestra la tarjeta 6 está en la lista, su fila se marca como "(el tuyo)".
// ---------------------------------------------------------------------------------------------
function jtiDelToken(token) {
  if (!token) return null;
  try {
    const parte = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(parte.padEnd(Math.ceil(parte.length / 4) * 4, '='))).jti; // el payload no está cifrado
  } catch {
    return null;
  }
}

async function mostrarListaNegra() {
  const { status, datos } = await llamar('GET', '/api/diagnostico/tokens');
  const tabla = $('tabla-lista-negra');
  tabla.replaceChildren();
  const filaUnica = (texto) => {
    const tr = document.createElement('tr');
    const td = celda(texto);
    td.colSpan = 4;
    tr.append(td);
    tabla.append(tr);
  };

  if (status !== 200 || !datos) {
    $('lista-negra-estado').textContent = `No se pudo leer la lista negra (código ${status})`;
    return filaUnica('(sin datos)');
  }
  $('lista-negra-estado').textContent = datos.revocacion
    ? `Revocación ACTIVA · ${datos.revocados.length} token(s) en tokens_revocados`
    : 'Revocación DESACTIVADA (jwtRevocar: false): el servidor no anota nada';
  if (datos.revocados.length === 0) return filaUnica('(vacía)');

  const miJti = jtiDelToken(tokenActual);
  for (const t of datos.revocados) {
    const tr = document.createElement('tr');
    // El servidor solo manda los primeros 8 caracteres del jti (termina en "…").
    const esElMio = Boolean(miJti) && t.jti === `${miJti.slice(0, 8)}…`;
    if (esElMio) tr.className = 'tuya';
    tr.append(
      celda(esElMio ? `${t.jti} (el tuyo)` : t.jti),
      celda(t.usuario),
      celda(new Date(t.expira).toLocaleTimeString()),
      celda(new Date(t.revocadoEn).toLocaleTimeString()),
    );
    tabla.append(tr);
  }
  return undefined;
}

async function refrescarTodo() {
  await Promise.all([mostrarEstado(), mostrarSesiones(), mostrarListaNegra()]);
}

// ---------------------------------------------------------------------------------------------
// Etapa 5 · Los eventos.
// ---------------------------------------------------------------------------------------------

// Formulario: preventDefault evita que el navegador envíe el form y recargue la página;
// el login lo hago yo con fetch para poder ver la respuesta.
$('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const cuerpo = { usuario: $('usuario').value, contrasena: $('contrasena').value };
  const { status, datos } = await llamar('POST', '/api/login', cuerpo);
  anotar('POST', '/api/login', status, datos);
  await refrescarTodo();
});

// Al elegir otro usuario en el <select> (evento change), pongo su contraseña de ejemplo
// para no tener que escribirla en cada prueba.
$('usuario').addEventListener('change', () => {
  $('contrasena').value = `${$('usuario').value}12345`;
});

// Botones: en vez de un addEventListener por botón, recorro todos los que tienen data-url.
// dataset.metodo y dataset.url leen los atributos data-metodo y data-url del HTML, así que
// si mañana se agrega un botón nuevo en index.html, funciona sin tocar este archivo.
document.querySelectorAll('button[data-url]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    const { metodo, url } = boton.dataset;
    const { status, datos } = await llamar(metodo, url);
    anotar(metodo, url, status, datos);
    await refrescarTodo();
  });
});

$('btn-refrescar').addEventListener('click', refrescarTodo);
$('btn-token-obtener').addEventListener('click', obtenerToken);
$('btn-token-renovar').addEventListener('click', renovarToken);
$('btn-token-comprobar').addEventListener('click', comprobarToken);
$('btn-lista-negra').addEventListener('click', mostrarListaNegra);
$('btn-sesiones').addEventListener('click', mostrarSesiones);

// ---------------------------------------------------------------------------------------------
// Etapa 6 · Al cargar la página.
// Por qué: la tarjeta 5 enseña con qué configuración arrancó el servidor (sirve para saber qué
// prueba estás haciendo), y luego pregunto el estado y la tabla para que la página empiece al día.
// ---------------------------------------------------------------------------------------------
async function iniciar() {
  const { status, datos } = await llamar('GET', '/api/config');
  $('config').textContent = status === 200 ? JSON.stringify(datos, null, 2) : `Error ${status}`;
  await refrescarTodo();
}

iniciar();
