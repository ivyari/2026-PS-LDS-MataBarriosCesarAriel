// Consultas a la tabla usuarios. Siempre con ? (consulta parametrizada), nunca pegando texto en el SQL.
const bcrypt = require('bcryptjs');

// Hash de relleno: si el usuario no existe, igual se hace bcrypt.compare para que la respuesta
// tarde lo mismo y nadie pueda adivinar, por el tiempo, qué usuarios existen.
const HASH_DE_RELLENO = '$2a$10$wQx6pjyqYBypKdFY85KJ3uAGxkR2.R8yMJnBTp4DJkXscXht8KeIi';

function crearModeloUsuarios(pool) {
  // Regresa el usuario (sin el hash) si la contraseña es correcta, o null si no.
  async function verificar(usuario, contrasena) {
    if (typeof usuario !== 'string' || typeof contrasena !== 'string') return null;

    const [filas] = await pool.query(
      'SELECT id, usuario, nombre, rol, contrasena_hash FROM usuarios WHERE usuario = ? LIMIT 1',
      [usuario],
    );
    const fila = filas[0];
    const coincide = await bcrypt.compare(contrasena, fila ? fila.contrasena_hash : HASH_DE_RELLENO);
    if (!fila || !coincide) return null;
    return { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol };
  }

  return { verificar };
}

module.exports = { crearModeloUsuarios };
