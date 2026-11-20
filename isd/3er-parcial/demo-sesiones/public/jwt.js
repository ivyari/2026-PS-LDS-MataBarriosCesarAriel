// Página de la demo con JWT. A diferencia de demo.js, aquí el navegador NO manda nada solo:
// la página guarda el token y lo pone ella misma en el encabezado Authorization de cada petición.
const $ = (id) => document.getElementById(id);

// El token vive en una variable (memoria de la página). No lo guardo en localStorage porque cualquier
// script de la página (un XSS) podría leerlo de ahí; a cambio, al recargar la página se pierde.
let token = null;
let reloj = null; // intervalo que actualiza los segundos que le quedan al token

// Una sola función para hablar con la API. Si hay token, lo manda como  Authorization: Bearer <token>.
async function llamar(metodo, url, cuerpo) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  if (token) opciones.headers.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(url, opciones);
  } catch (error) {
    return { status: 0, datos: { error: `No se pudo conectar con el servidor (${error.message})` } };
  }
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }
  return { status: respuesta.status, datos };
}

// Bitácora: la respuesta más nueva arriba. Todo con textContent (nunca innerHTML).
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
  $('jwt-bitacora').prepend(li);
}

// Base64URL → texto → JSON. Así se "lee" un JWT sin el secreto: el payload no está cifrado.
function decodificar(parte) {
  const base64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)); // TextDecoder para que "Ana López" salga con su acento
}

// Pinta el token con sus tres partes de colores y sus dos primeras partes decodificadas.
function mostrarToken() {
  const caja = $('jwt-token');
  caja.replaceChildren();
  if (!token) {
    caja.textContent = '(todavía no hay token)';
    $('jwt-encabezado').textContent = '(sin encabezado Authorization)';
    $('jwt-header-json').textContent = '—';
    $('jwt-payload-json').textContent = '—';
    $('jwt-fechas').textContent = '';
    return;
  }

  const [header, payload, firma] = token.split('.');
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

  $('jwt-encabezado').textContent = `Authorization: Bearer ${token}`;
  try {
    $('jwt-header-json').textContent = JSON.stringify(decodificar(header), null, 2);
    const datos = decodificar(payload);
    $('jwt-payload-json').textContent = JSON.stringify(datos, null, 2); // tal cual viene en el token
    // iat y exp son segundos desde 1970; abajo los muestro como fecha legible (× 1000 porque Date usa ms).
    $('jwt-fechas').textContent =
      `iat ${datos.iat} = ${new Date(datos.iat * 1000).toLocaleString()} · exp ${datos.exp} = ${new Date(datos.exp * 1000).toLocaleString()}`;
  } catch {
    $('jwt-header-json').textContent = '(no se pudo decodificar)';
    $('jwt-payload-json').textContent = '(no se pudo decodificar)';
    $('jwt-fechas').textContent = '';
  }
}

function fila(etiqueta, valor) {
  const tr = document.createElement('tr');
  const th = document.createElement('th');
  th.textContent = etiqueta;
  const td = document.createElement('td');
  td.textContent = valor;
  tr.append(th, td);
  return tr;
}

// Pregunta al servidor GET /api/jwt/sesion y muestra los elementos de la sesión que trae el token.
async function mostrarSesion() {
  clearInterval(reloj);
  const estado = $('jwt-estado');
  const tabla = $('jwt-elementos');
  tabla.replaceChildren();

  if (!token) {
    estado.textContent = 'Sin token';
    estado.className = 'estado sin-sesion';
    tabla.append(fila('—', '(inicia sesión para verlos)'));
    return;
  }

  const { status, datos } = await llamar('GET', '/api/jwt/sesion');
  if (status !== 200 || !datos) {
    estado.textContent = `El servidor no acepta el token: ${datos && datos.error ? datos.error : `código ${status}`}`;
    estado.className = 'estado sin-sesion';
    tabla.append(fila('—', 'El token ya no sirve. Inicia sesión otra vez o bórralo.'));
    return;
  }

  const { usuario: u } = datos;
  estado.className = 'estado con-sesion';
  const pintarEstado = () => {
    const quedan = Math.max(0, Math.round((Date.parse(datos.expiraEn) - Date.now()) / 1000));
    estado.textContent = `Con token: ${u.nombre} (${u.rol}) · sesión ${datos.sesion} · vence en ${quedan} s`;
    $('jwt-quedan').textContent = `${quedan} s`;
    if (quedan === 0) {
      clearInterval(reloj);
      estado.textContent = 'El token ya venció (exp). Pulsa "Volver a preguntar": el servidor responderá 401.';
      estado.className = 'estado sin-sesion';
    }
  };

  tabla.append(
    fila('Usuario (sub)', `${u.usuario} · id ${u.id}`),
    fila('Nombre', u.nombre),
    fila('Rol', u.rol),
    fila('Sesión (jti)', datos.jti),
    fila('Emitido (iat)', new Date(datos.emitidoEn).toLocaleString()),
    fila('Vence (exp)', new Date(datos.expiraEn).toLocaleString()),
    fila('Duración', `${datos.duracionSegundos} s`),
    fila('Quedan', ''),
    fila('Algoritmo', `${datos.algoritmo} (${datos.tipo})`),
    fila('Estado', datos.estado),
    fila('Dónde vive', datos.dondeVive),
    fila('Revocación', datos.revocacion),
  );
  tabla.rows[7].cells[1].id = 'jwt-quedan';
  pintarEstado();
  reloj = setInterval(pintarEstado, 1000); // la cuenta regresiva corre sola, sin preguntar al servidor
}

// La lista negra que guarda el servidor.
async function mostrarRevocados() {
  const { status, datos } = await llamar('GET', '/api/diagnostico/tokens');
  const tabla = $('jwt-tabla-revocados');
  tabla.replaceChildren();
  if (status !== 200 || !datos) {
    $('jwt-donde').textContent = `No se pudo leer la lista negra (código ${status})`;
    return;
  }
  $('jwt-donde').textContent = datos.revocacion
    ? 'Revocación ACTIVA: tabla tokens_revocados en MySQL'
    : 'Revocación DESACTIVADA (jwtRevocar: false): el servidor no anota nada';
  if (datos.revocados.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = '(vacía)';
    tr.append(td);
    tabla.append(tr);
    return;
  }
  for (const t of datos.revocados) {
    const tr = document.createElement('tr');
    for (const valor of [t.jti, t.usuario, new Date(t.expira).toLocaleString(), new Date(t.revocadoEn).toLocaleString()]) {
      const td = document.createElement('td');
      td.textContent = valor;
      tr.append(td);
    }
    tabla.append(tr);
  }
}

async function refrescarTodo() {
  mostrarToken();
  await Promise.all([mostrarSesion(), mostrarRevocados()]);
}

// ---------- Eventos ----------
$('jwt-form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  token = null; // el login no lleva token
  const cuerpo = { usuario: $('jwt-usuario').value, contrasena: $('jwt-contrasena').value };
  const { status, datos } = await llamar('POST', '/api/jwt/login', cuerpo);
  anotar('POST', '/api/jwt/login', status, datos);
  if (status === 200 && datos && datos.token) token = datos.token;
  await refrescarTodo();
});

$('jwt-usuario').addEventListener('change', () => {
  $('jwt-contrasena').value = `${$('jwt-usuario').value}12345`;
});

document.querySelectorAll('button[data-url]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    const { metodo, url } = boton.dataset;
    const { status, datos } = await llamar(metodo, url);
    anotar(metodo, url, status, datos);
    // refresh entrega un token nuevo: la página cambia el suyo (el anterior quedó revocado).
    if (url === '/api/jwt/refresh' && status === 200 && datos && datos.token) token = datos.token;
    // Después del logout la página CONSERVA el token a propósito: vuelve a pulsar perfil y verás si el
    // servidor lo sigue aceptando (jwtRevocar: false) o lo rechaza por revocado (jwtRevocar: true).
    await refrescarTodo();
  });
});

$('jwt-btn-sesion').addEventListener('click', refrescarTodo);
$('jwt-btn-revocados').addEventListener('click', mostrarRevocados);
// Borrar el token de la página = lo único que puede hacer el cliente para "cerrar sesión" si el servidor no revoca.
$('jwt-btn-olvidar').addEventListener('click', () => {
  token = null;
  refrescarTodo();
});
$('jwt-btn-copiar').addEventListener('click', async () => {
  if (!token) return;
  try {
    await navigator.clipboard.writeText(token);
    $('jwt-btn-copiar').textContent = 'Copiado ✔';
    setTimeout(() => { $('jwt-btn-copiar').textContent = 'Copiar token'; }, 1500);
  } catch {
    $('jwt-btn-copiar').textContent = 'No se pudo copiar';
  }
});

refrescarTodo();
