// La aplicación de la demo. server.js la arranca; las pruebas la arrancan con otras configuraciones.
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { crearModeloUsuarios } = require('./modelos/usuarios.modelo');
const { crearModeloTokens } = require('./modelos/tokens.modelo');

const NOMBRE_COOKIE = 'connect.sid';

// Tenemos que determinar dónde se deben almacenar las sesiones de la aplicación:
// si es 'memoria' usamos MemoryStore (vive dentro del proceso de Node y se pierde al reiniciar)
// y si es 'mysql' usamos MySQLStore (se guardan en la tabla sessions y sobreviven a un reinicio).
// almacen.all() sirve para ver todas las sesiones guardadas, en cualquiera de los dos casos.
function todasLasSesiones(almacen) {
  return new Promise((resolve, reject) => {
    almacen.all((error, sesiones) => (error ? reject(error) : resolve(sesiones || {})));
  });
}

// vamos a conectarnos a la aplicación
function crearApp(config, pool) {
  const app = express();
  app.use(express.json());
  const usuarios = crearModeloUsuarios(pool);

  // necesito crear una sesión a partir del usuario y su rol
  // opción 1: manejarla desde MySQL, significa que debo tener una tabla de sesiones
  // opción 2: manejarla desde memoria
  const almacen = config.almacen === 'memoria'
    ? new session.MemoryStore()
    : new MySQLStore({ createDatabaseTable: false, clearExpired: false }, pool);
  app.locals.almacen = almacen;

  // JWT: el token y su middleware quedan disponibles para las rutas que se programen con ellos
  const { firmarToken, requiereJWT } = crearJWT(config, pool);
  app.locals.firmarToken = firmarToken;
  app.locals.requiereJWT = requiereJWT;

  app.use(
    session({
      // nosotros creamos la cookie para que vaya sobre todo el elemento de la aplicación
      name: NOMBRE_COOKIE,
      secret: process.env.SESSION_SECRET || 'secreto-solo-para-la-demo',
      store: almacen,
      resave: false,
      saveUninitialized: false, // no crea la sesión ni la cookie hasta que se guarde algo en ella
      rolling: config.rolling,
      cookie: {
        maxAge: config.maxAgeMs,
        httpOnly: config.httpOnly,
        sameSite: config.sameSite,
        secure: false, // se activa cuando se use https
      },
    }),
  );

  // conocer el id de la sesión (solo los primeros 8 caracteres, nunca el id completo)
  const idCorto = (id) => (id ? `${id.slice(0, 8)}…` : null);

  // rolling = true mide la inactividad (desde el último uso);
  // rolling = false mide el tiempo desde que se inició sesión (hora fija).
  // Esta decisión la toma el servidor con sus propios datos, no el navegador.
  function vencida(sesion) {
    if (!sesion.creada) return false;
    const desde = config.rolling ? sesion.ultimoUso : sesion.creada;
    return Date.now() - desde > config.maxAgeMs;
  }

  // 401: tenemos que identificar quién entró
  function requiereSesion(req, res, next) {
    if (req.session.usuario && vencida(req.session)) {
      return req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie(NOMBRE_COOKIE);
        return res.status(401).json({
          error: '401 · Tu sesión venció: vuelve a iniciar sesión',
        });
      });
    }
    if (!req.session.usuario) {
      return res.status(401).json({
        error: '401 · No has iniciado sesión (o tu sesión ya venció)',
      });
    }
    req.session.ultimoUso = Date.now();
    next();
  }

  // 403: ya sé quién eres, pero tu rol no puede entrar aquí
  function requiereRol(rol) {
    return (req, res, next) => {
      if (req.session.usuario.rol !== rol) {
        return res.status(403).json({
          error: `403 · Eres ${req.session.usuario.usuario}, pero esta ruta es solo para ${rol}`,
        });
      }
      next();
    };
  }

  app.get('/api/config', (req, res) => res.json(config));

  // vamos a generar un contador en la sesión, sirve para saber que la sesión existe antes de entrar
  app.post('/api/visita', (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({ visitas: req.session.visitas, sesion: idCorto(req.sessionID) });
  });

  // ruta para iniciar sesión
  app.post('/api/login', async (req, res, next) => {
    try {
      const { usuario, contrasena } = req.body || {};
      const datos = await usuarios.verificar(usuario, contrasena);
      // el mismo mensaje si el usuario no existe o si la contraseña está mal
      if (!datos) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

      // guardo el id de antes y las visitas, para compararlos después del login
      const sesionAntes = req.session.visitas !== undefined ? idCorto(req.sessionID) : null;
      const visitas = req.session.visitas || 0;

      // guardo la sesión: aquí es donde el servidor recuerda quién eres
      const guardar = () => {
        req.session.usuario = datos;
        req.session.visitas = visitas;
        req.session.creada = Date.now();
        req.session.ultimoUso = Date.now();
        req.session.save((error) => {
          if (error) return next(error);
          res.json({ usuario: datos, sesionAntes, sesionDespues: idCorto(req.sessionID) });
        });
      };

      if (config.regenerarAlEntrar) {
        // se crea un id nuevo y se descarta el anterior (protege contra la fijación de sesión)
        req.session.regenerate((error) => (error ? next(error) : guardar()));
      } else {
        guardar();
      }
    } catch (error) {
      next(error);
    }
  });

  // cerrar sesión: destroy borra la sesión en el servidor y clearCookie quita la cookie del navegador
  app.post('/api/logout', (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie(NOMBRE_COOKIE);
      res.json({ mensaje: 'Sesión cerrada: el servidor la borró' });
    });
  });

  app.get('/api/sesion', requiereSesion, (req, res) => {
    const desde = config.rolling ? req.session.ultimoUso : req.session.creada;
    res.json({
      usuario: req.session.usuario,
      sesion: idCorto(req.sessionID),
      expiraEnSegundos: Math.max(0, Math.round((desde + config.maxAgeMs - Date.now()) / 1000)),
    });
  });

  app.get('/api/perfil', requiereSesion, (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({
      mensaje: `Hola, ${req.session.usuario.nombre}`,
      rol: req.session.usuario.rol,
      visitas: req.session.visitas,
    });
  });

  app.get('/api/admin/reporte', requiereSesion, requiereRol('admin'), (req, res) => {
    res.json({ reporte: 'Talleres: 3 · Inscritos: 57 · Cupo libre: 18' });
  });

  // vamos a simular que el servidor guarda la sesión y la expone; en producción jamás se expone
  app.get('/api/diagnostico/sesiones', async (req, res, next) => {
    try {
      const guardadas = await todasLasSesiones(almacen);
      const sesiones = Object.entries(guardadas).map(([id, s]) => ({
        sesion: idCorto(id),
        esLaTuya: id === req.sessionID,
        usuario: s.usuario ? s.usuario.usuario : '(sin iniciar sesión)',
        visitas: s.visitas || 0,
        expira: s.cookie && s.cookie.expires ? s.cookie.expires : null,
      }));
      res.json({ almacen: config.almacen, sesiones });
    } catch (error) {
      next(error);
    }
  });

  // cualquier otra ruta de la API responde 404 (va antes de los archivos estáticos)
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  app.use(express.static(path.join(__dirname, 'public')));

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: 'Error de servidor' });
  });

  return app;
}

// vamos a continuar con el jwt
// Se arma con config y pool para usar la misma configuración de la sesión y la misma base de datos.
function crearJWT(config, pool) {
  const tokens = crearModeloTokens(pool);
  const SECRETO_JWT = config.jwtSecreto || process.env.JWT_SECRET || 'secreto-jwt-solo-para-la-demo';

  // vamos a crear el token de un usuario: datos (payload) + vencimiento + id único (jti),
  // y va a estar firmado con HS256
  function firmarToken(usuario) {
    const opciones = { algorithm: 'HS256', jwtid: crypto.randomUUID() };
    if (config.jwtExpiraSeg) opciones.expiresIn = config.jwtExpiraSeg;
    return jwt.sign(
      { sub: String(usuario.id), usuario: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol },
      SECRETO_JWT,
      opciones,
    );
  }

  // para poder atender la petición con el middleware
  async function requiereJWT(req, res, next) {
    const encabezado = req.headers.authorization || '';
    if (!encabezado.startsWith('Bearer ')) {
      return res.status(401).json({ error: '401 · Falta el token para estar autorizado' });
    }
    const token = encabezado.slice('Bearer '.length);

    let datos;
    try {
      // solo aceptamos el algoritmo que nosotros usamos para firmar
      datos = jwt.verify(token, SECRETO_JWT, { algorithms: ['HS256'] });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: '401 · Token expirado: renuévalo o vuelve a iniciar sesión' });
      }
      return res.status(401).json({ error: '401 · Token inválido' });
    }

    try {
      // lista negra: si está revocado, ya se cerró la sesión aunque el token no haya vencido
      if (config.jwtRevocar && (await tokens.estaRevocado(datos.jti))) {
        return res.status(401).json({ error: '401 · Token revocado: ya se cerró la sesión' });
      }
    } catch (error) {
      return next(error);
    }

    req.jwt = datos;
    next();
  }

  function requiereRolJWT(rol) {
    return (req, res, next) => {
      if(req.jwt.rol !== rol) {
        return res.status(403).json({
          error: `403 · Eres ${req.jwt.usuario}, pero esta ruta no tienes el permiso para navegar de acuerdo a tu ${rol}`,});
      }
      next();
    }
  }

  app.post('/api/jwt/login', async (req, res, next) => {
    try {
      const { usuario, contrasena } = req.body || {};
      const datos = await usuarios.verificar(usuario, contrasena);
      if (!datos) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      res.json({ token: firmarToken(datos), usuario: datos });
    }catch (error) {
      next(error);
    }
  }); 

  app.get('/api/jwt/perfil', requiereJWT, (req, res) => {
    res.json({
      mensaje: `Hola, ${req.jwt.nombre}`,
      rol: req.jwt.rol,
      expiraEnSegundos: Math.max(0, req.jwt.exp - Math.floor(Date.now() / 1000)),
    });
  });

  //ejemplo de revocacion de un token todavia valido
  app.post('/api/jwt/refresh', requiereJWT, async (req, res) => {
    const {sub, usuario, nombre, rol} = req.jwt;
    res.json({ token: firmarToken({id: sub, usuario, nombre, rol}) });
  });

  app.get('/api/jwt/reporte', requiereJWT, requiereRolJWT('admin'), (req, res) => {
    res.json({ reporte: 'Talleres: 3'});
  }); 

  //que le pasa al token cuando logout
  app.post('/api/jwt/logout', requiereJWT, async (req, res, next) => {
    try{
      if (config.jwtRevocar) {
        await tokens.revocar(req.jwt.jti, req.jwt.usuario, req.jwt.exp);
        res.json({ mensaje: 'Token reocado en la el servidor, se anota en la lista negra', recocacion: true });
      }
      res.json({ mensaje: 'El servidor no guarda nada, solo se puede borrar el token desde el navegador', recocacion: false });
    } catch (error) {
      next(error);
    }   
  });

}

module.exports = { crearApp, crearJWT, NOMBRE_COOKIE };
