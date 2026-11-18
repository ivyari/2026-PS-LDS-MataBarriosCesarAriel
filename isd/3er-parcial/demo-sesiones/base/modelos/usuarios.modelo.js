// Consultas a la tabla usuarios. Siempre con ? (consulta parametrizada), nunca pegando texto en el SQL.
const bcrypt = require('bcryptjs');

function crearModeloUsuarios(pool) {
  async function verificar(usuario, contrasena) {
    if (typeof usuario !== 'string' || typeof contrasena !== 'string') return null;

    const [filas] = await pool.query(
      'SELECT id, usuario, nombre, rol, contrasena_hash FROM usuarios WHERE usuario = ? LIMIT 1',
      [usuario],
    );
    if (filas.length === 0) return null;

    const [registro] = filas;
    const coincide = await bcrypt.compare(contrasena, registro.contrasena_hash);
    if (!coincide) return null;

    return {
      id: registro.id,
      usuario: registro.usuario,
      nombre: registro.nombre,
      rol: registro.rol,
    };
  }

  return { verificar };
}

module.exports = { crearModeloUsuarios };
