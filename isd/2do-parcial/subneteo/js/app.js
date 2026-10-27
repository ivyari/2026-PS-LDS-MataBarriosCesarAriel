"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const S = window.Subneteo;
  const $ = (id) => document.getElementById(id);

  function escapar(valor) {
    return String(valor).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  function mostrarError(destino, error) {
    destino.innerHTML = `
            <div class="error">${escapar(error.message || error)}</div>
        `;
  }

  function mostrarDatos(titulo, datos) {
    return `
            <article class="tarjeta">
                <h3>${escapar(titulo)}</h3>
                <dl class="datos">
                    ${datos
                      .map(
                        ([etiqueta, valor]) => `
                        <div>
                            <dt>${escapar(etiqueta)}</dt>
                            <dd>${escapar(valor)}</dd>
                        </div>
                    `,
                      )
                      .join("")}
                </dl>
            </article>
        `;
  }

  function mostrarTabla(subredes, vlsm = false) {
    const columnas = [
      ["Subred", "nombre"],
      ...(vlsm ? [["Hosts solicitados", "hostsSolicitados"]] : []),
      ["Red/prefijo", "redPrefijo"],
      ["Máscara", "mascara"],
      ["Primer host", "primerHost"],
      ["Último host", "ultimoHost"],
      ["Broadcast", "broadcast"],
      ["Hosts utilizables", "hosts"],
    ];

    return `
            <article class="tarjeta">
                <h3>Tabla de subredes</h3>
                <div class="tabla-envoltura">
                    <table class="resultado">
                        <thead>
                            <tr>
                                ${columnas
                                  .map(
                                    ([nombre]) => `<th>${escapar(nombre)}</th>`,
                                  )
                                  .join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${subredes
                              .map(
                                (s) => `
                                <tr>
                                    ${columnas
                                      .map(([, campo]) => {
                                        let valor = s[campo];

                                        if (campo === "redPrefijo") {
                                          valor = `${s.red}/${s.prefijo}`;
                                        }

                                        return `<td class="ip">${escapar(valor ?? "")}</td>`;
                                      })
                                      .join("")}
                                </tr>
                            `,
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>
            </article>
        `;
  }

  function activarPanel(id) {
    document.querySelectorAll(".pestana").forEach((boton) => {
      const seleccionado = boton.dataset.panel === id;
      boton.classList.toggle("activa", seleccionado);
      boton.setAttribute("aria-selected", String(seleccionado));
      boton.tabIndex = seleccionado ? 0 : -1;
    });

    document.querySelectorAll(".panel").forEach((panel) => {
      const visible = panel.id === id;
      panel.classList.toggle("activo", visible);
      panel.hidden = !visible;
    });
  }

  document.querySelector(".pestanas").addEventListener("click", (evento) => {
    const boton = evento.target.closest(".pestana");

    if (boton) activarPanel(boton.dataset.panel);
  });

  activarPanel("panel-binario");

  $("form-binario").addEventListener("submit", (evento) => {
    evento.preventDefault();

    const destino = $("bin-resultado");

    try {
      const entrada = $("bin-entrada").value.trim();

      if (entrada.includes(".")) {
        const decimal = entrada.split(".").map(Number);
        const binario = S.ipABinario(entrada);

        destino.innerHTML =
          mostrarDatos("Resultado de la conversión", [
            ["Dirección IPv4", entrada],
            ["Dirección binaria", binario],
          ]) +
          `
                    <article class="tarjeta">
                        <h3>Conversión por octeto</h3>
                        <div class="tabla-envoltura">
                            <table class="resultado">
                                <thead>
                                    <tr>
                                        <th>Octeto</th>
                                        <th>Decimal</th>
                                        <th>Binario</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${decimal
                                      .map(
                                        (n, i) => `
                                        <tr>
                                            <td>${i + 1}</td>
                                            <td>${n}</td>
                                            <td class="binario">${S.octetoABinario(n)}</td>
                                        </tr>
                                    `,
                                      )
                                      .join("")}
                                </tbody>
                            </table>
                        </div>
                    </article>
                `;
      } else {
        if (!/^\d{1,3}$/.test(entrada)) {
          throw new Error("Ingresa un octeto entre 0 y 255 o una IP completa.");
        }

        const numero = Number(entrada);
        const binario = S.octetoABinario(numero);

        destino.innerHTML =
          mostrarDatos("Resultado de la conversión", [
            ["Decimal", numero],
            ["Binario (8 bits)", binario],
          ]) +
          `
                    <article class="tarjeta">
                        <h3>Descomposición binaria</h3>
                        <p class="binario">${binario}</p>
                        <p class="leyenda">
                            Cada posición representa un valor de potencia de 2.
                        </p>
                        <div class="tabla-envoltura">
                            <table class="pasos">
                                <thead>
                                    <tr>
                                        ${[128, 64, 32, 16, 8, 4, 2, 1]
                                          .map((n) => `<th>${n}</th>`)
                                          .join("")}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        ${binario
                                          .split("")
                                          .map((bit) => `<td>${bit}</td>`)
                                          .join("")}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </article>
                `;
      }
    } catch (error) {
      mostrarError(destino, error);
    }
  });

  $("form-flsm").addEventListener("submit", (evento) => {
    evento.preventDefault();

    const destino = $("flsm-resultado");

    try {
      const red = $("flsm-red").value.trim();
      const prefijo = S.analizarPrefijo($("flsm-prefijo").value);
      const modo = $("flsm-modo").value;
      const cantidad = Number($("flsm-cantidad").value);

      const resultado = S.calcularFLSM(red, prefijo, modo, cantidad);

      destino.innerHTML =
        mostrarDatos("Resumen FLSM", [
          ["Red base", `${resultado.redBase}/${resultado.prefijoBase}`],
          ["Máscara base", resultado.mascaraBase],
          ["Nuevo prefijo", `/${resultado.prefijoNuevo}`],
          ["Nueva máscara", resultado.mascara],
          ["Número de subredes", resultado.cantidadSubredes],
          ["Hosts por subred", S.hostsUtilizables(resultado.prefijoNuevo)],
        ]) + mostrarTabla(resultado.subredes);
    } catch (error) {
      mostrarError(destino, error);
    }
  });

  function agregarFila(nombre = "", hosts = 10) {
    const fila = document.createElement("div");
    fila.className = "req-fila";

    const campoNombre = document.createElement("input");
    campoNombre.type = "text";
    campoNombre.className = "vlsm-nombre";
    campoNombre.placeholder = "Nombre del área";
    campoNombre.setAttribute("aria-label", "Nombre de la subred");
    campoNombre.required = true;
    campoNombre.value = nombre;

    const campoHosts = document.createElement("input");
    campoHosts.type = "number";
    campoHosts.className = "vlsm-hosts";
    campoHosts.min = "1";
    campoHosts.step = "1";
    campoHosts.required = true;
    campoHosts.value = String(hosts);
    campoHosts.setAttribute("aria-label", "Cantidad de hosts");

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "quitar";
    quitar.textContent = "×";
    quitar.title = "Eliminar subred";
    quitar.setAttribute("aria-label", "Eliminar subred");

    quitar.addEventListener("click", () => fila.remove());

    fila.append(campoNombre, campoHosts, quitar);
    $("vlsm-filas").appendChild(fila);
  }

  $("vlsm-agregar").addEventListener("click", () => agregarFila());

  // Filas iniciales de ejemplo.
  agregarFila("Administración", 50);
  agregarFila("Laboratorio", 25);
  agregarFila("Invitados", 10);

  $("form-vlsm").addEventListener("submit", (evento) => {
    evento.preventDefault();

    const destino = $("vlsm-resultado");

    try {
      const red = $("vlsm-red").value.trim();
      const prefijo = S.analizarPrefijo($("vlsm-prefijo").value);

      const filas = [...document.querySelectorAll("#vlsm-filas .req-fila")];

      const requerimientos = filas.map((fila) => ({
        nombre: fila.querySelector(".vlsm-nombre").value.trim(),
        hosts: Number(fila.querySelector(".vlsm-hosts").value),
      }));

      const resultado = S.calcularVLSM(red, prefijo, requerimientos);

      destino.innerHTML =
        mostrarDatos("Resumen VLSM", [
          ["Red base", `${resultado.redBase}/${resultado.prefijoBase}`],
          ["Máscara base", resultado.mascaraBase],
          ["Subredes asignadas", resultado.subredes.length],
          ["Direcciones asignadas", resultado.totalDireccionesAsignadas],
        ]) + mostrarTabla(resultado.subredes, true);
    } catch (error) {
      mostrarError(destino, error);
    }
  });

  $("form-ip").addEventListener("submit", (evento) => {
    evento.preventDefault();

    const destino = $("ip-resultado");

    try {
      const ip = $("ip-dir").value.trim();
      const prefijo = S.analizarPrefijo($("ip-prefijo").value);
      const r = S.describirSubred(ip, prefijo);

      destino.innerHTML = mostrarDatos("Datos de la dirección IPv4", [
        ["Dirección IP", r.ip],
        ["Prefijo", `/${r.prefijo}`],
        ["Máscara", r.mascara],
        ["Dirección de red", r.red],
        ["Primer host", r.primerHost],
        ["Último host", r.ultimoHost],
        ["Broadcast", r.broadcast],
        ["Direcciones totales", r.totalDirecciones],
        ["Hosts utilizables", r.hosts],
      ]);
    } catch (error) {
      mostrarError(destino, error);
    }
  });
});
