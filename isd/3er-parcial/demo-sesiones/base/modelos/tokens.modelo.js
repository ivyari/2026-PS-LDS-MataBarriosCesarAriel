// en este archivo vamos a tener la lista negra de la tabla de los tokens revocados.

function crearModeloTokens(pool) {
  // vamos a anotar un token como revocado
  async function revocar(jti, usuario, exp) {
    await pool.query(
      'INSERT IGNORE INTO tokens_revocados (jti, usuario, expira) VALUES (?, ?, FROM_UNIXTIME(?))',
      [jti, usuario, exp],
    );
  }

  // pregunto: ¿este jwt está en la lista?
  async function estaRevocado(jti) {
    const [filas] = await pool.query(
      'SELECT 1 FROM tokens_revocados WHERE jti = ?',
      [String(jti || '')],
    );
    return filas.length > 0;
  }

  // consultamos la lista de la tabla
  async function listar() {
    const [filas] = await pool.query(
      'SELECT jti, usuario, expira, revocado_en FROM tokens_revocados ORDER BY revocado_en DESC, jti',
    );
    return filas;
  }

  return { revocar, estaRevocado, listar };
}

module.exports = { crearModeloTokens };
