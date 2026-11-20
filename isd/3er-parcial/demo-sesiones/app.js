// La aplicación de la demo. server.js la arranca; las pruebas la arrancan con otras configuraciones.
//
// PARTE 1 · Sesiones con cookie (express-session) + token JWT integrado dentro de la sesión.
// PARTE 2 · Sesiones solo con JWT (página jwt.html / rutas /api/jwt/*).
//
// Diferencia clave:
//   Cookie → la sesión vive en el SERVIDOR (MySQL o memoria) y el navegador solo guarda el id.
//   JWT    → la sesión vive DENTRO del token (lo guarda el cliente) y el servidor solo verifica la
//            firma; lo único que persiste es la lista negra si jwtRevocar está activo.

const path   = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const jwt     = require('jsonwebtoken');
const MySQLStore = require('express-mysql-session')(session);
const { crearModeloUsuarios } = require('./modelos/usuarios.modelo');
const { crearModeloTokens }   = require('./modelos/tokens.modelo');

const NOMBRE_COOKIE = 'connect.sid';

// Pide al almacén TODAS las sesiones guardadas y las regresa en una promesa.
// MySQLStore puede contestar con callback o con promesa; esta función acepta las dos formas.
function todasLasSesiones(almacen) {
  return new Promise((resolve, reject) => {
    const promesa = almacen.all((error, sesiones) => (error ? reject(error) : resolve(sesiones)));
    if (promesa && typeof promesa.then === 'function') promesa.then(resolve, reject);
  });
}

// Los ids (de sesión o jti del token) nunca se muestran completos: solo sus primeros 8 caracteres.
const idCorto = (id) => (id ? `${String(id).slice(0, 8)}…` : null);

// Convierte segundos desde 1970 (iat / exp del JWT) a texto de fecha ISO.
const fechaISO = (seg) => (typeof seg === 'number' ? new Date(seg * 1000).toISOString() : null);

// ─────────────────────────────────────────────────────────────────────────────
function crearApp(config, pool) {
  const app      = express();
  app.use(express.json());

  const usuarios = crearModeloUsuarios(pool);
  const tokens   = crearModeloTokens(pool);

  // ═══════════════════════════════════════════════════════════════════════════
  // HERRAMIENTAS JWT  (compartidas por Parte 1 y Parte 2)
  // ═══════════════════════════════════════════════════════════════════════════

  const SECRETO_JWT    = config.jwtSecreto || process.env.JWT_SECRET || 'secreto-jwt-solo-para-la-demo';
  const EXPIRA_JWT_SEG = config.jwtExpiraSeg || 5 * 60;

  // Firma un token con los datos del usuario.
  function firmarToken(usuario) {
    return jwt.sign(
      { sub: String(usuario.id), usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol },
      SECRETO_JWT,
      { algorithm: 'HS256', expiresIn: EXPIRA_JWT_SEG, jwtid: crypto.randomUUID() },
    );
  }

  // Valida un token y regresa sus elementos listos para mostrarse.
  // No lanza error si venció o fue revocado: lo indica en `estado`
  // ('activa' | 'vencida' | 'revocada' | 'inválida'). Regresa null si no hay token.
  async function elementosDelToken(token) {
    if (!token) return null;

    let datos;
    let estado = 'activa';
    try {
      datos = jwt.verify(token, SECRETO_JWT, { algorithms: ['HS256'] });
    } catch (error) {
      if (error.name !== 'TokenExpiredError') {
        return { token, estado: 'inválida', revocado: false, error: 'La firma no coincide o el token está mal formado' };
      }
      datos  = jwt.decode(token); // firma buena pero ya pasó exp: lo leo solo para mostrarlo
      estado = 'vencida';
    }

    const revocado = Boolean(config.jwtRevocar) && (await tokens.estaRevocado(datos.jti));
    if (revocado) estado = 'revocada';

    const { header } = jwt.decode(token, { complete: true });
    return {
      token,
      usuario: { id: Number(datos.sub), usuario: datos.usuario, nombre: datos.nombre, rol: datos.rol },
      sesion: idCorto(datos.jti),
      jti:    datos.jti,
      emitidoEn:        fechaISO(datos.iat),
      expiraEn:         fechaISO(datos.exp),
      expiraEnSegundos: Math.max(0, datos.exp - Math.floor(Date.now() / 1000)),
      duracionSegundos: datos.exp - datos.iat,
      algoritmo: header.alg,
      tipo:      header.typ,
      estado,
      revocado,
      payload: datos, // lo que cualquiera puede leer decodificando el token (sin contraseñas)
    };
  }

  // Anota un token en la lista negra (si jwtRevocar está activo). Regresa true si lo revocó.
  async function revocarToken(token) {
    if (!config.jwtRevocar || !token) return false;
    const datos = jwt.decode(token);
    if (!datos || !datos.jti) return false;
    await tokens.revocar(datos.jti, datos.usuario, datos.exp);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTE 1 · SESIONES CON COOKIE (con su token JWT integrado)
  // ═══════════════════════════════════════════════════════════════════════════

  // ¿Dónde viven las sesiones?
  //  'memoria' → MemoryStore (proceso de Node, se pierden al reiniciar; NO es el navegador).
  //  'mysql'   → tabla sessions (sobreviven a un reinicio).
  const almacen =
    config.almacen === 'memoria'
      ? new session.MemoryStore()
      : new MySQLStore({ createDatabaseTable: false, clearExpired: true, checkExpirationInterval: 60 * 1000 }, pool);
  app.locals.almacen = almacen;

  app.use(
    session({
      name:             NOMBRE_COOKIE,
      secret:           process.env.SESSION_SECRET || 'secreto-solo-para-la-demo',
      store:            almacen,
      resave:           false,
      saveUninitialized: false, // no crear sesión ni cookie hasta que haya algo que guardar
      rolling:          config.rolling,
      cookie: {
        maxAge:   config.maxAgeMs,
        httpOnly: config.httpOnly,
        sameSite: config.sameSite,
        secure:   false, // en http://localhost no hay HTTPS; en producción va en true
      },
    }),
  );

  // ¿Ya venció? rolling: false → hora fija desde que inició sesión; rolling: true → desde el último uso.
  function vencida(ses) {
    const desde = config.rolling ? ses.ultimoUso : ses.creada;
    return Date.now() - desde > config.maxAgeMs;
  }

  // Middleware: exige sesión activa. 401 si no hay usuario o si ya venció.
  function requiereSesion(req, res, next) {
    if (!req.session.usuario) {
      return res.status(401).json({ error: '401 · No has iniciado sesión (o tu sesión ya venció)' });
    }
    if (vencida(req.session)) {
      const tokenDeLaSesion = req.session.token;
      return req.session.destroy(() => {
        revocarToken(tokenDeLaSesion).catch(() => {});
        res.clearCookie(NOMBRE_COOKIE);
        res.status(401).json({ error: '401 · Tu sesión venció: vuelve a iniciar sesión' });
      });
    }
    req.session.ultimoUso = Date.now();
    return next();
  }

  // Middleware: exige rol concreto. Siempre DESPUÉS de requiereSesion.
  function requiereRol(rol) {
    return (req, res, next) => {
      if (req.session.usuario.rol !== rol) {
        return res.status(403).json({
          error: `403 · Eres ${req.session.usuario.usuario}, pero esta ruta es solo para ${rol}`,
        });
      }
      return next();
    };
  }

  // ── Rutas de sesión con cookie ──────────────────────────────────────────────

  app.get('/api/config', (req, res) => res.json(config));

  // Contador sin protección: crea una sesión aunque no haya usuario.
  app.post('/api/visita', (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({ visitas: req.session.visitas, sesion: idCorto(req.sessionID) });
  });

  app.post('/api/login', async (req, res, next) => {
    try {
      const { usuario, contrasena } = req.body || {};
      const datos =
        typeof usuario === 'string' && typeof contrasena === 'string'
          ? await usuarios.verificar(usuario, contrasena)
          : null;
      if (!datos) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

      const antes   = req.session.visitas !== undefined ? idCorto(req.sessionID) : null;
      const visitas = req.session.visitas || 0;

      // Si ya había una sesión con token (otro login sin logout), ese token se revoca.
      await revocarToken(req.session.token);

      const guardar = () => {
        req.session.usuario   = datos;
        req.session.visitas   = visitas;
        req.session.creada    = Date.now();
        req.session.ultimoUso = Date.now();
        req.session.token     = firmarToken(datos); // el token de esta sesión vive en el servidor
        req.session.save((error) => {
          if (error) return next(error);
          return res.json({
            usuario:       datos,
            sesionAntes:   antes,
            sesionDespues: idCorto(req.sessionID),
            token:         req.session.token,
          });
        });
      };

      // Contra la fijación de sesión: al entrar se descarta la sesión anterior y se crea otra.
      if (config.regenerarAlEntrar) {
        req.session.regenerate((error) => (error ? next(error) : guardar()));
      } else {
        guardar();
      }
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/logout', async (req, res, next) => {
    try {
      const tokenRevocado = await revocarToken(req.session.token);
      req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie(NOMBRE_COOKIE);
        return res.json({ mensaje: 'Sesión cerrada: el servidor la borró', tokenRevocado });
      });
    } catch (error) {
      next(error);
    }
  });

  // Datos de la sesión + elementos de su token (validado en este momento).
  app.get('/api/sesion', requiereSesion, async (req, res, next) => {
    try {
      const desde = config.rolling ? req.session.ultimoUso : req.session.creada;
      res.json({
        usuario:          req.session.usuario,
        sesion:           idCorto(req.sessionID),
        expiraEnSegundos: Math.max(0, Math.round((desde + config.maxAgeMs - Date.now()) / 1000)),
        jwt:              await elementosDelToken(req.session.token),
      });
    } catch (error) {
      next(error);
    }
  });

  // Obtiene el token de la sesión actual (tarjeta 6 de la demo).
  app.get('/api/sesion/token', requiereSesion, async (req, res, next) => {
    try {
      if (!req.session.token) req.session.token = firmarToken(req.session.usuario);
      const t = await elementosDelToken(req.session.token);
      res.json({
        token:            t.token,
        sesion:           t.sesion,
        expiraEn:         t.expiraEn,
        expiraEnSegundos: t.expiraEnSegundos,
        estado:           t.estado,
      });
    } catch (error) {
      next(error);
    }
  });

  // Renueva el token de la sesión actual (el anterior se revoca).
  app.post('/api/sesion/token', requiereSesion, async (req, res, next) => {
    try {
      const anteriorRevocado = await revocarToken(req.session.token);
      req.session.token = firmarToken(req.session.usuario);
      res.json({
        mensaje:         'Token nuevo para esta sesión',
        anteriorRevocado,
        jwt: await elementosDelToken(req.session.token),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/perfil', requiereSesion, (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({
      mensaje:  `Hola, ${req.session.usuario.nombre}`,
      rol:      req.session.usuario.rol,
      visitas:  req.session.visitas,
    });
  });

  app.get('/api/admin/reporte', requiereSesion, requiereRol('admin'), (req, res) => {
    res.json({ reporte: 'Talleres: 3 · Inscritos: 57 · Cupo libre: 18' });
  });

  // Solo para clase: lo que guarda el servidor. En producción jamás se expone.
  app.get('/api/diagnostico/sesiones', async (req, res, next) => {
    try {
      const sesiones = await todasLasSesiones(almacen);
      const lista = Object.entries(sesiones || {}).map(([id, s]) => ({
        sesion:    idCorto(id),
        esLaTuya:  id === req.sessionID,
        usuario:   s.usuario ? s.usuario.usuario : null,
        visitas:   s.visitas || 0,
        expira:    s.cookie && s.cookie.expires ? new Date(s.cookie.expires).toISOString() : null,
      }));
      res.json({ almacen: config.almacen === 'memoria' ? 'memoria' : 'mysql', sesiones: lista });
    } catch (error) {
      next(error);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTE 2 · SESIONES SOLO CON JWT (página jwt.html / rutas /api/jwt/*)
  // ═══════════════════════════════════════════════════════════════════════════

  // Middleware: exige token Bearer válido. 401 si falta, es inválido, venció o fue revocado.
  async function requiereJWT(req, res, next) {
    const encabezado = req.get('authorization') || '';
    if (!encabezado.startsWith('Bearer ')) {
      return res.status(401).json({ error: '401 · Falta el token: manda  Authorization: Bearer <token>' });
    }
    const token = encabezado.slice('Bearer '.length).trim();

    let datos;
    try {
      datos = jwt.verify(token, SECRETO_JWT, { algorithms: ['HS256'] });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: '401 · Token expirado: renuévalo o vuelve a iniciar sesión' });
      }
      return res.status(401).json({ error: '401 · Token inválido' });
    }

    try {
      if (config.jwtRevocar && (await tokens.estaRevocado(datos.jti))) {
        return res.status(401).json({ error: '401 · Token revocado: ya se cerró la sesión' });
      }
    } catch (error) {
      return next(error);
    }

    req.jwt   = datos; // payload ya verificado: sub, usuario, nombre, rol, iat, exp, jti
    req.token = token;
    return next();
  }

  // Middleware: exige rol concreto (versión JWT). Siempre DESPUÉS de requiereJWT.
  function requiereRolJWT(rol) {
    return (req, res, next) => {
      if (req.jwt.rol !== rol) {
        return res.status(403).json({
          error: `403 · Eres ${req.jwt.usuario}, pero esta ruta es solo para ${rol}`,
        });
      }
      return next();
    };
  }

  // ── Rutas JWT ───────────────────────────────────────────────────────────────

  // Login JWT: no crea sesión ni cookie; regresa el token para que el cliente lo guarde.
  app.post('/api/jwt/login', async (req, res, next) => {
    try {
      const { usuario, contrasena } = req.body || {};
      const datos =
        typeof usuario === 'string' && typeof contrasena === 'string'
          ? await usuarios.verificar(usuario, contrasena)
          : null;
      if (!datos) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      const token = firmarToken(datos);
      return res.json({ token, usuario: datos, expiraEnSegundos: EXPIRA_JWT_SEG });
    } catch (error) {
      return next(error);
    }
  });

  // Equivalente de GET /api/sesion pero sin cookie: los elementos del JWT.
  app.get('/api/jwt/sesion', requiereJWT, async (req, res, next) => {
    try {
      const elementos = await elementosDelToken(req.token);
      res.json({
        ...elementos,
        dondeVive:  'En el token que guarda el cliente; el servidor no guarda la sesión',
        revocacion: config.jwtRevocar
          ? 'Activa: al hacer logout el jti se anota en tokens_revocados y el token deja de servir'
          : 'Desactivada: el servidor no guarda nada; el token sirve hasta su exp aunque hagas logout',
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jwt/perfil', requiereJWT, (req, res) => {
    res.json({
      mensaje:          `Hola, ${req.jwt.nombre}`,
      rol:              req.jwt.rol,
      expiraEnSegundos: Math.max(0, req.jwt.exp - Math.floor(Date.now() / 1000)),
    });
  });

  // Renovar: entrega token nuevo (jti nuevo, exp nuevo). El anterior se revoca si jwtRevocar.
  app.post('/api/jwt/refresh', requiereJWT, async (req, res, next) => {
    try {
      const anteriorRevocado = await revocarToken(req.token);
      const { sub, usuario, nombre, rol } = req.jwt;
      const token = firmarToken({ id: sub, usuario, nombre, rol });
      return res.json({ token, anteriorRevocado, expiraEnSegundos: EXPIRA_JWT_SEG });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/jwt/reporte', requiereJWT, requiereRolJWT('admin'), (req, res) => {
    res.json({ reporte: 'Talleres: 3 · Inscritos: 57 · Cupo libre: 18' });
  });

  app.post('/api/jwt/logout', requiereJWT, async (req, res, next) => {
    try {
      if (await revocarToken(req.token)) {
        return res.json({ mensaje: 'Token revocado en el servidor: se anotó en la lista negra', revocado: true });
      }
      return res.json({ mensaje: 'El servidor no guarda nada: solo el cliente puede borrar el token', revocado: false });
    } catch (error) {
      return next(error);
    }
  });

  // Solo para clase: la lista negra (equivalente de /api/diagnostico/sesiones).
  app.get('/api/diagnostico/tokens', async (req, res, next) => {
    try {
      const filas = await tokens.listar();
      res.json({
        revocacion: Boolean(config.jwtRevocar),
        revocados:  filas.map((f) => ({
          jti:        idCorto(f.jti),
          usuario:    f.usuario,
          expira:     f.expira,
          revocadoEn: f.revocado_en,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Al final: 404 de la API, archivos estáticos y manejador de errores
  // ═══════════════════════════════════════════════════════════════════════════
  app.use('/api', (req, res) =>
    res.status(404).json({ error: `404 · No existe la ruta ${req.method} ${req.originalUrl}` }),
  );

  app.use(express.static(path.join(__dirname, 'public')));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: '500 · Error del servidor' });
  });

  return app;
}

module.exports = { crearApp, NOMBRE_COOKIE };
