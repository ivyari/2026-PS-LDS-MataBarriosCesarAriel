"use strict";

window.Subneteo = (() => {
  const MAX_IP = 4294967295;

  function ipAEntero(ip) {
    const partes = String(ip).trim().split(".");

    if (partes.length !== 4) {
      throw new Error("La IP debe contener cuatro octetos.");
    }

    let numero = 0;

    for (const parte of partes) {
      if (!/^\d{1,3}$/.test(parte)) {
        throw new Error("La dirección IP contiene un octeto inválido.");
      }

      const octeto = Number(parte);

      if (octeto < 0 || octeto > 255) {
        throw new Error("Cada octeto debe estar entre 0 y 255.");
      }

      numero = numero * 256 + octeto;
    }

    return numero;
  }

  function enteroAIp(numero) {
    if (!Number.isInteger(numero) || numero < 0 || numero > MAX_IP) {
      throw new Error("Número IPv4 fuera de rango.");
    }

    return [
      Math.floor(numero / 16777216) % 256,
      Math.floor(numero / 65536) % 256,
      Math.floor(numero / 256) % 256,
      numero % 256,
    ].join(".");
  }

  function validarPrefijo(prefijo) {
    if (!Number.isInteger(prefijo) || prefijo < 0 || prefijo > 32) {
      throw new Error("El prefijo debe estar entre /0 y /32.");
    }
  }

  function octetoABinario(octeto) {
    if (!Number.isInteger(octeto) || octeto < 0 || octeto > 255) {
      throw new Error("El octeto debe estar entre 0 y 255.");
    }

    return octeto.toString(2).padStart(8, "0");
  }

  function ipABinario(ip) {
    ipAEntero(ip);

    return ip.split(".").map(Number).map(octetoABinario).join(".");
  }

  function prefijoAMascara(prefijo) {
    validarPrefijo(prefijo);

    return [0, 1, 2, 3]
      .map((i) => {
        const bits = Math.max(0, Math.min(8, prefijo - i * 8));
        return bits === 0 ? 0 : 256 - 2 ** (8 - bits);
      })
      .join(".");
  }

  function analizarPrefijo(entrada) {
    const texto = String(entrada).trim();

    if (/^\/?\d{1,2}$/.test(texto)) {
      const prefijo = Number(texto.replace("/", ""));
      validarPrefijo(prefijo);
      return prefijo;
    }

    const numeroMascara = ipAEntero(texto);
    let prefijo = 0;
    let encontroCero = false;

    for (let bit = 31; bit >= 0; bit--) {
      const activo = Math.floor(numeroMascara / 2 ** bit) % 2 === 1;

      if (activo) {
        if (encontroCero) {
          throw new Error("La máscara no es contigua.");
        }
        prefijo++;
      } else {
        encontroCero = true;
      }
    }

    if (prefijoAMascara(prefijo) !== texto) {
      throw new Error("La máscara ingresada no es válida.");
    }

    return prefijo;
  }

  function tamanoBloque(prefijo) {
    validarPrefijo(prefijo);
    return 2 ** (32 - prefijo);
  }

  function hostsUtilizables(prefijo) {
    validarPrefijo(prefijo);

    if (prefijo === 32) return 1;
    if (prefijo === 31) return 2;

    return tamanoBloque(prefijo) - 2;
  }

  function claseDeRed(ip) {
    const primero = Number(ip.split(".")[0]);

    if (primero <= 127) return "A";
    if (primero <= 191) return "B";
    if (primero <= 223) return "C";
    if (primero <= 239) return "D (multicast)";
    return "E (experimental)";
  }

  function esPrivada(ip) {
    const n = ipAEntero(ip);

    function dentro(base, prefijo) {
      const bloque = tamanoBloque(prefijo);
      return Math.floor(n / bloque) === Math.floor(ipAEntero(base) / bloque);
    }

    return (
      dentro("10.0.0.0", 8) ||
      dentro("172.16.0.0", 12) ||
      dentro("192.168.0.0", 16)
    );
  }

  function describirSubred(ip, prefijo) {
    const n = ipAEntero(ip);
    validarPrefijo(prefijo);

    const bloque = tamanoBloque(prefijo);
    const red = Math.floor(n / bloque) * bloque;
    const broadcast = red + bloque - 1;

    let primerHost;
    let ultimoHost;

    if (prefijo <= 30) {
      primerHost = enteroAIp(red + 1);
      ultimoHost = enteroAIp(broadcast - 1);
    } else if (prefijo === 31) {
      primerHost = enteroAIp(red);
      ultimoHost = enteroAIp(broadcast);
    } else {
      primerHost = enteroAIp(red);
      ultimoHost = enteroAIp(red);
    }

    return {
      ip,
      prefijo,
      mascara: prefijoAMascara(prefijo),
      red: enteroAIp(red),
      primerHost,
      ultimoHost,
      broadcast: enteroAIp(broadcast),
      totalDirecciones: bloque,
      hosts: hostsUtilizables(prefijo),
      clase: claseDeRed(ip),
      privada: esPrivada(ip),
    };
  }

  function calcularFLSM(red, prefijoBase, modo, cantidad) {
    validarPrefijo(prefijoBase);
    ipAEntero(red);

    if (!Number.isInteger(cantidad) || cantidad < 1) {
      throw new Error("La cantidad debe ser un entero positivo.");
    }

    let prefijoNuevo;

    if (modo === "subredes") {
      prefijoNuevo = prefijoBase + Math.ceil(Math.log2(cantidad));
    } else if (modo === "hostsPorSubred") {
      prefijoNuevo = 32 - Math.ceil(Math.log2(cantidad + 2));
    } else {
      throw new Error("Modo de cálculo desconocido.");
    }

    if (prefijoNuevo < prefijoBase || prefijoNuevo > 32) {
      throw new Error("La red base no tiene espacio suficiente.");
    }

    if (
      modo === "hostsPorSubred" &&
      hostsUtilizables(prefijoNuevo) < cantidad
    ) {
      throw new Error("No caben los hosts solicitados en cada subred.");
    }

    const redInicial =
      Math.floor(ipAEntero(red) / tamanoBloque(prefijoBase)) *
      tamanoBloque(prefijoBase);

    const total = tamanoBloque(prefijoBase) / tamanoBloque(prefijoNuevo);

    if (total > 4096) {
      throw new Error("Se generarían demasiadas subredes para mostrarlas.");
    }

    const bloque = tamanoBloque(prefijoNuevo);
    const subredes = [];

    for (let i = 0; i < total; i++) {
      const inicio = redInicial + i * bloque;
      const fin = inicio + bloque - 1;

      subredes.push({
        nombre: `Subred ${i + 1}`,
        red: enteroAIp(inicio),
        prefijo: prefijoNuevo,
        mascara: prefijoAMascara(prefijoNuevo),
        primerHost:
          prefijoNuevo <= 30
            ? enteroAIp(inicio + 1)
            : prefijoNuevo === 31
              ? enteroAIp(inicio)
              : "No aplica",
        ultimoHost:
          prefijoNuevo <= 30
            ? enteroAIp(fin - 1)
            : prefijoNuevo === 31
              ? enteroAIp(fin)
              : "No aplica",
        broadcast: enteroAIp(fin),
        totalDirecciones: bloque,
        hosts: hostsUtilizables(prefijoNuevo),
      });
    }

    return {
      redBase: enteroAIp(redInicial),
      prefijoBase,
      mascaraBase: prefijoAMascara(prefijoBase),
      prefijoNuevo,
      mascara: prefijoAMascara(prefijoNuevo),
      cantidadSubredes: total,
      subredes,
    };
  }

  function calcularVLSM(red, prefijoBase, requerimientos) {
    validarPrefijo(prefijoBase);

    if (!Array.isArray(requerimientos) || requerimientos.length === 0) {
      throw new Error("Agrega al menos una subred.");
    }

    const redInicial =
      Math.floor(ipAEntero(red) / tamanoBloque(prefijoBase)) *
      tamanoBloque(prefijoBase);

    const finBase = redInicial + tamanoBloque(prefijoBase) - 1;

    const solicitudes = requerimientos
      .map((r, indice) => {
        const nombre = String(r.nombre ?? "").trim();
        const hosts = Number(r.hosts);

        if (!nombre) {
          throw new Error(`La subred ${indice + 1} necesita un nombre.`);
        }

        if (!Number.isInteger(hosts) || hosts < 1) {
          throw new Error(`Los hosts de "${nombre}" deben ser positivos.`);
        }

        const prefijo = 32 - Math.ceil(Math.log2(hosts + 2));

        if (prefijo < prefijoBase || prefijo < 0 || prefijo > 30) {
          throw new Error(
            `La red base no tiene espacio para "${nombre}" (${hosts} hosts).`,
          );
        }

        return {
          nombre,
          hostsSolicitados: hosts,
          prefijo,
          bloque: tamanoBloque(prefijo),
          indice,
        };
      })
      .sort((a, b) => b.bloque - a.bloque || a.indice - b.indice);

    let siguiente = redInicial;
    const subredes = [];

    for (const solicitud of solicitudes) {
      const inicio = Math.ceil(siguiente / solicitud.bloque) * solicitud.bloque;
      const fin = inicio + solicitud.bloque - 1;

      if (fin > finBase) {
        throw new Error(
          `No queda espacio suficiente para "${solicitud.nombre}".`,
        );
      }

      subredes.push({
        nombre: solicitud.nombre,
        hostsSolicitados: solicitud.hostsSolicitados,
        red: enteroAIp(inicio),
        prefijo: solicitud.prefijo,
        mascara: prefijoAMascara(solicitud.prefijo),
        primerHost: enteroAIp(inicio + 1),
        ultimoHost: enteroAIp(fin - 1),
        broadcast: enteroAIp(fin),
        totalDirecciones: solicitud.bloque,
        hosts: hostsUtilizables(solicitud.prefijo),
      });

      siguiente = fin + 1;
    }

    return {
      redBase: enteroAIp(redInicial),
      prefijoBase,
      mascaraBase: prefijoAMascara(prefijoBase),
      subredes,
      totalDireccionesAsignadas: subredes.reduce(
        (suma, s) => suma + s.totalDirecciones,
        0,
      ),
    };
  }

  return {
    ipAEntero,
    enteroAIp,
    octetoABinario,
    ipABinario,
    prefijoAMascara,
    analizarPrefijo,
    tamanoBloque,
    hostsUtilizables,
    claseDeRed,
    esPrivada,
    describirSubred,
    calcularFLSM,
    calcularVLSM,
  };
})();
