const path = require('path');
// Pruebas de la parte JWT. Usa la base de .env (necesita la tabla tokens_revocados: npm run bd).
const BASE = path.join(__dirname, '..');
const { crearApp } = require(path.join(BASE, 'app'));
const { crearPool } = require(path.join(BASE, 'db'));
const configBase = require(path.join(BASE, 'config'));
let ok = 0, mal = 0;
const revisar = (cond, txt, extra) => { if (cond) { ok++; console.log('✔', txt); } else { mal++; console.log('✘', txt, extra !== undefined ? JSON.stringify(extra) : ''); } };
async function servidor(cfg) {
  const app = crearApp({ ...configBase, ...cfg }, crearPool());
  const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const url = `http://localhost:${srv.address().port}`;
  const pedir = async (metodo, ruta, { cuerpo, token, cookie } = {}) => {
    const h = {}; if (cuerpo) h['Content-Type'] = 'application/json'; if (token !== undefined) h.Authorization = token;
    if (cookie) h.Cookie = cookie;
    const r = await fetch(url + ruta, { method: metodo, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    let datos = null; try { datos = await r.json(); } catch {}
    return { status: r.status, datos, cookie: r.headers.get('set-cookie') };
  };
  return { pedir, cerrar: () => new Promise((r) => srv.close(r)) };
}
(async () => {
  const s = await servidor({});
  let r = await s.pedir('POST', '/api/jwt/login', { cuerpo: { usuario: 'ana', contrasena: 'mala' } });
  revisar(r.status === 401 && r.datos.error === 'Usuario o contraseña incorrectos', 'login JWT con contraseña mala → 401', r);
  r = await s.pedir('POST', '/api/jwt/login', { cuerpo: { usuario: 'ana', contrasena: 'ana12345' } });
  const tokAna = r.datos.token;
  revisar(r.status === 200 && tokAna.split('.').length === 3 && !r.cookie, 'login JWT de ana → 200 con token de 3 partes y SIN cookie', r);
  revisar(!('contrasena_hash' in r.datos.usuario), 'la respuesta del login no trae el hash');
  r = await s.pedir('GET', '/api/jwt/sesion');
  revisar(r.status === 401 && /Falta el token/.test(r.datos.error), 'sin Authorization → 401 falta el token', r);
  r = await s.pedir('GET', '/api/jwt/sesion', { token: 'Bearer abc.def.ghi' });
  revisar(r.status === 401 && /inválido/.test(r.datos.error), 'token inventado → 401 inválido', r);
  const partes = tokAna.split('.'); const p = JSON.parse(Buffer.from(partes[1], 'base64url')); p.rol = 'admin';
  const falsificado = partes[0] + '.' + Buffer.from(JSON.stringify(p)).toString('base64url') + '.' + partes[2];
  r = await s.pedir('GET', '/api/jwt/reporte', { token: 'Bearer ' + falsificado });
  revisar(r.status === 401, 'token con rol cambiado a mano (firma ya no coincide) → 401', r);
  r = await s.pedir('GET', '/api/jwt/sesion', { token: 'Bearer ' + tokAna });
  const d = r.datos;
  revisar(r.status === 200 && d.usuario.usuario === 'ana' && d.usuario.rol === 'alumno' && d.usuario.id === 1, '/api/jwt/sesion → 200 con usuario, id y rol', d);
  revisar(typeof d.jti === 'string' && d.sesion === d.jti.slice(0, 8) + '…' && d.algoritmo === 'HS256' && d.estado === 'activa', 'trae jti, sesión corta, algoritmo HS256 y estado activa', d);
  revisar(d.duracionSegundos === 300 && d.expiraEnSegundos > 295 && d.expiraEnSegundos <= 300 && Date.parse(d.expiraEn) - Date.parse(d.emitidoEn) === 300000, 'emitidoEn/expiraEn ISO y expiraEnSegundos ≈ 300', d);
  console.log('   ↳ ejemplo:', JSON.stringify({ ...d, payload: undefined }));
  r = await s.pedir('GET', '/api/jwt/perfil', { token: 'Bearer ' + tokAna });
  revisar(r.status === 200 && r.datos.mensaje === 'Hola, Ana López', '/api/jwt/perfil → 200', r);
  r = await s.pedir('GET', '/api/jwt/reporte', { token: 'Bearer ' + tokAna });
  revisar(r.status === 403 && /Eres ana/.test(r.datos.error), 'ana en /api/jwt/reporte → 403', r);
  r = await s.pedir('POST', '/api/jwt/login', { cuerpo: { usuario: 'admin', contrasena: 'admin12345' } });
  r = await s.pedir('GET', '/api/jwt/reporte', { token: 'Bearer ' + r.datos.token });
  revisar(r.status === 200 && /Talleres/.test(r.datos.reporte), 'admin en /api/jwt/reporte → 200', r);
  r = await s.pedir('POST', '/api/jwt/refresh', { token: 'Bearer ' + tokAna });
  const tokNuevo = r.datos.token;
  revisar(r.status === 200 && tokNuevo !== tokAna && r.datos.anteriorRevocado === true, 'refresh → token nuevo y el anterior revocado', r);
  r = await s.pedir('GET', '/api/jwt/sesion', { token: 'Bearer ' + tokAna });
  revisar(r.status === 401 && /revocado/.test(r.datos.error), 'el token anterior al refresh → 401 revocado', r);
  r = await s.pedir('GET', '/api/jwt/sesion', { token: 'Bearer ' + tokNuevo });
  revisar(r.status === 200, 'el token nuevo sirve → 200', r);
  r = await s.pedir('POST', '/api/jwt/logout', { token: 'Bearer ' + tokNuevo });
  revisar(r.status === 200 && r.datos.revocado === true, 'logout JWT → revocado: true (una sola respuesta)', r);
  r = await s.pedir('GET', '/api/jwt/perfil', { token: 'Bearer ' + tokNuevo });
  revisar(r.status === 401 && /revocado/.test(r.datos.error), 'después del logout el token ya no sirve → 401 revocado', r);
  r = await s.pedir('GET', '/api/diagnostico/tokens');
  revisar(r.status === 200 && r.datos.revocados.length >= 2 && r.datos.revocados.every((t) => t.usuario === 'ana'), '/api/diagnostico/tokens lista la lista negra', r);
  r = await s.pedir('GET', '/api/sesion', { token: 'Bearer ' + tokNuevo });
  revisar(r.status === 401, 'el JWT no sirve en las rutas de cookie (/api/sesion → 401)', r);
  await s.cerrar();

  const corto = await servidor({ jwtExpiraSeg: 1 });
  r = await corto.pedir('POST', '/api/jwt/login', { cuerpo: { usuario: 'luis', contrasena: 'luis12345' } });
  const tokCorto = r.datos.token;
  await new Promise((x) => setTimeout(x, 2100));
  r = await corto.pedir('GET', '/api/jwt/sesion', { token: 'Bearer ' + tokCorto });
  revisar(r.status === 401 && /expirado/.test(r.datos.error), 'jwtExpiraSeg: 1 → a los 2 s responde 401 token expirado', r);
  await corto.cerrar();

  const sinLista = await servidor({ jwtRevocar: false });
  r = await sinLista.pedir('POST', '/api/jwt/login', { cuerpo: { usuario: 'luis', contrasena: 'luis12345' } });
  const tokLuis = r.datos.token;
  r = await sinLista.pedir('POST', '/api/jwt/logout', { token: 'Bearer ' + tokLuis });
  revisar(r.status === 200 && r.datos.revocado === false, 'jwtRevocar: false → logout responde revocado: false', r);
  r = await sinLista.pedir('GET', '/api/jwt/sesion', { token: 'Bearer ' + tokLuis });
  revisar(r.status === 200 && /Desactivada/.test(r.datos.revocacion), 'jwtRevocar: false → el token SIGUE sirviendo después del logout', r);
  await sinLista.cerrar();

  // ---------- Integración: el token de la sesión con cookie ----------
  const integ = await servidor({});
  r = await integ.pedir('POST', '/api/login', { cuerpo: { usuario: 'ana', contrasena: 'ana12345' } });
  const galleta = r.cookie.split(';')[0];
  const tokSesion = r.datos.token;
  revisar(r.status === 200 && typeof tokSesion === 'string' && tokSesion.split('.').length === 3, 'login con cookie → también trae un token JWT', r.datos);
  r = await integ.pedir('GET', '/api/sesion', { cookie: galleta });
  const j = r.datos.jwt;
  revisar(r.status === 200 && j && j.token === tokSesion && j.estado === 'activa' && j.revocado === false, '/api/sesion → trae jwt con estado activa', r.datos);
  revisar(j.usuario.usuario === 'ana' && j.usuario.rol === 'alumno' && typeof j.jti === 'string' && j.expiraEnSegundos > 0 && j.emitidoEn && j.expiraEn, '/api/sesion → jwt con usuario, rol, jti, iat/exp y expiraEnSegundos', j);
  r = await integ.pedir('GET', '/api/sesion/token', { cookie: galleta });
  revisar(r.status === 200 && r.datos.token === tokSesion && r.datos.estado === 'activa' && r.datos.expiraEnSegundos > 0, 'GET /api/sesion/token → con la sesión se obtiene su token', r.datos);
  r = await integ.pedir('GET', '/api/sesion/token');
  revisar(r.status === 401, 'GET /api/sesion/token sin sesión → 401', r);
  r = await integ.pedir('GET', '/api/jwt/sesion', { token: 'Bearer ' + tokSesion });
  revisar(r.status === 200 && r.datos.jti === j.jti, 'el token de la sesión sirve solo, sin cookie (Bearer)', r);
  r = await integ.pedir('POST', '/api/sesion/token', { cookie: galleta });
  const tokSesion2 = r.datos.jwt && r.datos.jwt.token;
  revisar(r.status === 200 && r.datos.anteriorRevocado === true && tokSesion2 && tokSesion2 !== tokSesion, 'POST /api/sesion/token → token nuevo y el anterior revocado', r.datos);
  r = await integ.pedir('GET', '/api/jwt/sesion', { token: 'Bearer ' + tokSesion });
  revisar(r.status === 401 && /revocado/.test(r.datos.error), 'el token anterior de la sesión → 401 revocado', r);
  r = await integ.pedir('GET', '/api/sesion', { cookie: galleta });
  revisar(r.status === 200 && r.datos.jwt.token === tokSesion2, '/api/sesion ya muestra el token nuevo', r.datos);
  r = await integ.pedir('POST', '/api/logout', { cookie: galleta });
  revisar(r.status === 200 && r.datos.tokenRevocado === true, 'logout de la sesión → también revoca su token', r.datos);
  r = await integ.pedir('GET', '/api/jwt/sesion', { token: 'Bearer ' + tokSesion2 });
  revisar(r.status === 401 && /revocado/.test(r.datos.error), 'después del logout, el token de la sesión → 401 revocado', r);
  await integ.cerrar();

  const integCorto = await servidor({ jwtExpiraSeg: 1 });
  r = await integCorto.pedir('POST', '/api/login', { cuerpo: { usuario: 'luis', contrasena: 'luis12345' } });
  const galleta2 = r.cookie.split(';')[0];
  await new Promise((x) => setTimeout(x, 2100));
  r = await integCorto.pedir('GET', '/api/sesion', { cookie: galleta2 });
  revisar(r.status === 200 && r.datos.jwt.estado === 'vencida', 'token de 1 s: la sesión sigue (200) pero su token sale como vencida', r.datos);
  r = await integCorto.pedir('POST', '/api/sesion/token', { cookie: galleta2 });
  revisar(r.status === 200 && r.datos.jwt.estado === 'activa', 'POST /api/sesion/token renueva el token vencido', r.datos);
  await integCorto.pedir('POST', '/api/logout', { cookie: galleta2 }); // no dejar sesiones de prueba en tu base
  await integCorto.cerrar();
  console.log(`\n${ok} de ${ok + mal} pruebas JWT pasaron.`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
