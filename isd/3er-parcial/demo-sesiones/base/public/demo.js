// La página solo hace fetch a la API. El navegador manda la cookie solo (misma página, mismo servidor).
const $ = (id) => document.getElementById(id);

// Centraliza las llamadas para no repetir fetch ni perder el código HTTP de 401 y 403.
async function llamar(metodo, url, cuerpo) {
  const opciones = { method: metodo };

  if (cuerpo !== undefined) {
    opciones.headers = { 'Content-Type': 'application/json' };
    opciones.body = JSON.stringify(cuerpo);
  }

  const respuesta = await fetch(url, opciones);
  let datos = null;

  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  return { status: respuesta.status, datos };
}

// Expone el helper a la consola sin convertir los datos del servidor en HTML.
window.llamar = llamar;

// En cada respuesta se conserva su significado: el código decide el color y textContent evita ejecutar texto recibido.
function agregarBitacora(metodo, url, status, datos) {
  const li = document.createElement('li');
  const codigo = document.createElement('span');
  const ruta = document.createTextNode(` ${metodo} ${url}`);
  const pre = document.createElement('pre');

  codigo.className = 'codigo';
  if (status >= 200 && status < 300) codigo.classList.add('ok');
  else if (status === 401) codigo.classList.add('e401');
  else if (status === 403) codigo.classList.add('e403');
  else codigo.classList.add('error');

  codigo.textContent = String(status);
  pre.textContent = datos === null ? 'null' : JSON.stringify(datos, null, 2);

  li.append(codigo, ruta, pre);
  $('bitacora').prepend(li);
}

// Consulta al servidor porque el estado real de la sesión no debe confiarse en lo que pueda leer JavaScript.
async function refrescarEstado() {
  const { status, datos } = await llamar('GET', '/api/sesion');
  const estado = $('estado');

  estado.classList.remove('con-sesion', 'sin-sesion');

  if (status === 200 && datos) {
    const nombre = datos.usuario?.nombre ?? datos.usuario?.usuario ?? 'Usuario';
    const rol = datos.usuario?.rol ?? '';
    estado.textContent = `${nombre} (${rol}) · sesión ${datos.sesion ?? ''} · vence en ${datos.expiraEnSegundos} s`;
    estado.classList.add('con-sesion');
  } else {
    estado.textContent = 'Sin sesión (el servidor responde 401)';
    estado.classList.add('sin-sesion');
  }

  const visible = document.cookie;
  $('cookie-js').textContent = visible || '(vacío)';
}

// Reemplaza completamente el cuerpo para que una actualización nunca duplique las filas anteriores.
async function actualizarTabla() {
  const { datos } = await llamar('GET', '/api/diagnostico/sesiones');
  const tbody = $('tabla-sesiones');
  tbody.replaceChildren();

  if (!datos) {
    $('donde').textContent = 'Diagnóstico no disponible';
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 4;
    celda.textContent = '(sin sesiones)';
    fila.append(celda);
    tbody.append(fila);
    return;
  }

  // El servidor dice dónde guarda las sesiones; así la tarjeta 4 cambia sola al editar config.js.
  $('donde').textContent = datos.almacen === 'memoria'
    ? 'En la memoria del servidor: se pierden al reiniciar (la tabla sessions no se usa)'
    : 'En MySQL, tabla sessions: sobreviven a un reinicio del servidor';

  const sesiones = Array.isArray(datos.sesiones) ? datos.sesiones : [];
  if (sesiones.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 4;
    celda.textContent = '(sin sesiones)';
    fila.append(celda);
    tbody.append(fila);
    return;
  }

  for (const sesion of sesiones) {
    const fila = document.createElement('tr');
    if (sesion.esLaTuya) fila.classList.add('tuya');

    const celdaSesion = document.createElement('td');
    const usuario = typeof sesion.usuario === 'object'
      ? (sesion.usuario?.usuario ?? '')
      : (sesion.usuario ?? '');

    celdaSesion.textContent = `${sesion.sesion ?? ''}${fila.classList.contains('tuya') ? ' (la tuya)' : ''}`;

    const celdaUsuario = document.createElement('td');
    celdaUsuario.textContent = usuario || '(sin iniciar sesión)';

    const celdaVisitas = document.createElement('td');
    celdaVisitas.textContent = String(sesion.visitas ?? 0);

    const celdaVence = document.createElement('td');
    const fecha = sesion.expira ? new Date(sesion.expira) : null;
    celdaVence.textContent = fecha && !Number.isNaN(fecha.getTime())
      ? fecha.toLocaleString()
      : '';

    fila.append(celdaSesion, celdaUsuario, celdaVisitas, celdaVence);
    tbody.append(fila);
  }
}

// Agrupa las dos consultas posteriores a una acción para que el estado y la tabla siempre se mantengan sincronizados.
async function refrescarTodo() {
  await Promise.all([refrescarEstado(), actualizarTabla()]);
}

// Impide la recarga del formulario y ejecuta el login con los datos escritos por el usuario.
$('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const usuario = $('usuario').value;
  const contrasena = $('contrasena').value;
  const resultado = await llamar('POST', '/api/login', { usuario, contrasena });
  // Se anota la respuesta completa: sesionAntes y sesionDespues son la evidencia de P-13 y P-14.
  agregarBitacora('POST', '/api/login', resultado.status, resultado.datos);
  await refrescarTodo();
});

// Actualiza la contraseña de ejemplo para evitar que el usuario tenga que escribirla al cambiar de usuario.
$('usuario').addEventListener('change', (evento) => {
  $('contrasena').value = `${evento.target.value}12345`;
});

// Cada botón de la página conserva su método y ruta en data-*; un solo recorrido evita duplicar la lógica.
document.querySelectorAll('[data-metodo][data-url]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    const metodo = boton.dataset.metodo;
    const url = boton.dataset.url;
    const resultado = await llamar(metodo, url);
    agregarBitacora(metodo, url, resultado.status, resultado.datos);
    await refrescarTodo();
  });
});

$('btn-refrescar').addEventListener('click', refrescarTodo);
$('btn-sesiones').addEventListener('click', actualizarTabla);

// Al cargar el script, ya colocado al final del body, se muestra la configuración y se consulta el estado actual.
(async () => {
  const configuracion = await llamar('GET', '/api/config');
  $('config').textContent = configuracion.datos === null
    ? 'null'
    : JSON.stringify(configuracion.datos, null, 2);
  await refrescarTodo();
})();