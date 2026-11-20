// Configuración de la demo. Después de cada cambio: Ctrl+C y vuelve a correr  npm start
module.exports = {
  // Dónde guarda el servidor las sesiones:
  //  'mysql'   → tabla sessions (sobreviven a un reinicio del servidor).
  //  'memoria' → memoria del proceso de Node (se pierden al reiniciar; NO es el navegador).
  almacen: 'mysql',

  // Cuánto dura la sesión con cookie, en milisegundos. 10 minutos = 10 * 60 * 1000
  maxAgeMs: 10 * 60 * 1000,

  // true: cada petición reinicia el reloj (vence por inactividad).
  // false: vence a la hora fija desde el login, aunque el usuario siga usando la página.
  rolling: false,

  // true: el JavaScript de la página NO puede leer la cookie (document.cookie no la muestra).
  httpOnly: true,

  // 'lax': la cookie no viaja en peticiones POST que vienen de otros sitios.
  sameSite: 'lax',

  // true: al iniciar sesión el servidor cambia el id de sesión (protege contra fijación de sesión).
  regenerarAlEntrar: true,

  // ── JWT ──────────────────────────────────────────────────────────────────────
  // Cuántos segundos dura el token. 5 minutos = 5 * 60
  jwtExpiraSeg: 5 * 60,

  // true: al cerrar sesión el servidor anota el jti en tokens_revocados y ya no lo acepta.
  // false: el servidor no guarda nada; el token sigue sirviendo hasta que venza aunque hagas logout.
  jwtRevocar: true,
};
