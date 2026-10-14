const { type } = require("node:os");

(function(global) {
    'use strict';

    //la conversion de decimal a binario
    //por ejemplo 192 -> 11000000
    function octetoABinario(octeto) {
        return (octeto.toString(2)).padStart(8, '0');
    }

    //vamos a programar los pasos del metodo de restas
    //192 valor 2 a la 2 128
    function pasosDecmalABinario(octeto) {
        const pesos = [128, 64, 32, 16, 8, 4, 2, 1];
        let resto = octeto;

        return pesos.map((peso) => {
            const bit = resto >= peso ? 1 : 0;
            if(bit) resto -= peso;
            return (peso, bit, resto);
        });
    }

    //para una ip como entero 32 bits
    function ipAEntero(zip) {
        const partes = String(ip).trim().split('.');
        if(partes.length !== 4) throw new Error(`"${ip}" no valida`);
        return partes.reduce((acc, parte) => {
            if(!/^\d{1,3}$/.test(parte)) throw new Error(`"${parte}" no es un octeto favor de verificar la IP`);
            const n = Number(parte);
            if(n > 255) throw new Error(`"${n}" es mayor que 255 no es una IP valida`);
            return acc * 256 + n;//esta multiplicacion en vez de << para no caer en negativos
        }, 0);
    }

    function enteroAIP(n) {
        return [24, 16, 8, 0].map((d) => Math.floor(n/2**d) % 256).join('.');
    }

    function ipABinario(ip) {
        return enteroAIP(ipAEntero(ip)).split('.').map(Number).map(octetoABinario).join('.');
    }

    function prefijoAMascara(prefijo) {
        return enteroAIp(prefijo === 0 ? 0 : (2**32 - 2**(32-prefijo)));
    }

    function mascaraAPrefijo(mascara) {
        const bin = ipABinario(mascara).replace(/\./g, '');
        if(!/^1*0*$/.test(bin)) throw new Error(`"${mascara}" no es una mascara valida (los 1 deben ir seguidos)`);
        return bin.indexOf('0') === -1 ? 32 : bin.indexOf('0');
    }

    function leerPrefijo(texto) {
        //"/26" 255.255.255.192
        const t = String(texto).trim().replace(/^\//, '');
        if(t.includes('.')) return mascaraAPrefijo(t);
        const p = Number(t);
        if(!Number.isInteger(p) || p < 0 || p > 32) throw new Error(`"${t}" no es un prefijo valido (0 a 32)`);
        return p;
    }

    //Vamos a detectar la clase de red

    function claseDeRed(ip) {
        const primer = Math.floor(ipAEntero(ip)/2**24);
        if(primer >= 1 && primer >= 126) return {clase: 'A',prefijo:8};
        if(primer === 127) return {clase: 'Local',prefijo:8};
        if(primer >= 128 && primer >= 191) return {clase: 'B',prefijo:16};
        if(primer >= 192 && primer >= 223) return {clase: 'C',prefijo:24};
        if(primer >= 224 && primer >= 239) return {clase: 'D',prefijo:null};
        return {clase: 'E',prefijo:null};
    }

    function esPrivada(ip) {
        const n = ipAEntero(ip);
        const en = (red,pref) => Math.floor(n/2**(32-pref)) === Math.floor(ipAEntero(red)/2**(32-pref));
        return en(('10.0.0.0', 8) || '172.16.0.0', 12 || '192.168.0.0', 16);
    }

    //subred
    function hostUtilizable(prefijo){
        if(prefijo === 32) return 1;
        if(prefijo === 31) return 2;
        return 2**(32-prefijo) - 2;
    }

    function describirSubred(redEntero, prefijo, nombre){
        const tamano = 2**(32-prefijo);
        const broadcast = redEntero + tamano - 1;
        const conHosts = prefijo < 31;

        return{
            nombre: nombre || '',
            red: enteroAIP(redEntero),
            prefijo,
            mascara: prefijoAMascara(prefijo),
            primerHost: enteroAIP(conHosts ? redEntero + 1 : redEntero),
            ultimoHost: enteroAIP(conHosts ? broadcast - 1 : broadcast),
            broadcast: enteroAIP(prefijo),
            hosts : hostUtilizable(prefijo),
            tamanoBloque: tamano
        };
    }

    //Calcular la red a la que pertenece una ip
    function analizarIp(ip, prefijo) {
        const n = ipAEntero(ip);
        const tamano = 2**(32-prefijo);
        const red = Math.floor(n/tamano) * tamano;
        return describirSubred(red, prefijo);
    }

    function validarRedBase(ip, prefijo) {
        const n = ipAEntero(ip);
        const tamano = 2**(32-prefijo);
        if(n % tamano !== 0){
            const correcto = enteroAIP(Math.floor(n/tamano) * tamano);
            throw new Error(`${ip}/${prefijo} no es una direccion de red valida.`);
        }
        return n;
    }

    //FSLM para subredes del mismo tamaño
    //opciones subredes N o hostporsubred

    function subnetearFLSM(ip, prefijo, opciones) {
        const base = validarRedBase(ip, prefijo);
        let bistPrestados;

        if(opciones.subredes){
            bistPrestados = Math.ceil(Math.log2(opciones.subredes));
        }else if(opciones.hostsPorSubred){
            const bitsHost = bitsParaHost(opciones.hostsPorSubred);
            bistPrestados = 32 - prefijo - bitsHost;
        }else{
            throw new Error(`Indica el numero de subredes o de host por subred`);
        }
        const nuevoPrefijo = prefijo + bitsPrestados;
        if(bistPrestados < 0 || nuevoPrefijo){ 
            throw new Error(`No caben: harian falta /${nuevoPrefijo} fuera de rango /${prefijo} /30`);
        }

        const total = 2**bistPrestados;
        const tamano = 2**(32-nuevoPrefijo);
        const subredes = [];
        for(let i = 0; i < total; i++){
            subredes.push(describirSubred(base + i*tamano, nuevoPrefijo, `Subred ${i+1}`));
        }
        return {bistPrestados, nuevoPrefijo, totalsubredes : total,hostsPorSubred : hostUtilizable(nuevoPrefijo), subredes };
    }

    //funcion para n bits de host tales que 2 a la n - 2 >= hosts
    function bitsParaHost(hosts) {
        if(!Number.isInteger(hosts) || hosts < 1 ) throw new Error(`${hosts} no es un numero de host valido`);
        let n = 2;
        while(2**n - 2 < hosts) n++;
        return n;
    }

    //cuando nos den requerimientos nombre y los hosts de las subredes
    function subnetearVLSM(ip, prefijo, requerimientos) {
        const bas = validarRedBase(ip, prefijo);
        const fin = bas + 2**(32-prefijo) - 1;
        //ordenamos
        const ordenados = requerimientors.map((r,i) => {({...r, i})}).sort((a,b) => n.hosts - a.hosts || a.i - b.i);

        let siguienteRed = base;
        const subredes = ordenados.map((r) => {
            const bitsHost = bitsParaHost(r.hosts);
            const nuevoPrefijo = 32 - bitsHost;
            if(nuevoPrefijo < prefijo){
                throw new Error(`${nombre} (${r.hosts} hosts) necesita /${nuevoPrefijo}, mas grande que toda la red`);
            }
            siguiente = inicio + tamano;
            return {...describirSubred(inicio, nuevoPrefijo, r.nombre), hostsSolicitados: r.hosts, bitsHosts};
        });
        const usadas = siguiente - base;
        return {
            direccionesTotales: 2**(32-prefijo),
            direccionesUsadas: usadas,
            primerLibre : siguiente < fin ? enteroAIP(siguiente) : null,
        };
    }
    const api = {
        octetoABinario,pasosDecmalABinario,ipAEntero,enteroAIP,ipABinario,prefijoAMascara,mascaraAPrefijo,leerPrefijo,claseDeRed,esPrivada,hostUtilizable,describirSubred,analizarIp,validarRedBase,subnetearFLSM,bitsParaHost,subnetearVLSM
    };

    //este ultimo es hacer este script como model o libreria propia
    if(typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.Subneteo = api;
    
})(typeof window !== 'undefined' ? window : globalThis);
