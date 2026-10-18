// rest.get(url, callback)
// rest.post(url, body, callback)
// rest.put(url, body, callback)
// rest.delete(url, callback)
// function callback(estado, respuesta) {...}

    console.log("main.js cargado");
    var seccionActual = "login";
   
    // Guardamos el id del gestor cuando hace login correctamente
    // Si es null, significa que NO hay gestor logueado
    var idGestorActual = null;
    var tokenGestorActual = null;
    var temporizadorSesion = null;

    function ConToken(url) {

        if (tokenGestorActual == null) {
            return url;
        }

        var separador = url.includes("?") ? "&" : "?";

        return url + separador + "token=" + encodeURIComponent(tokenGestorActual);
    }

    
    function sesionCaducada() {

        alert("Tu sesión ha caducado. Vuelve a iniciar sesión.");

        salir();
    }


    // Modo del formulario: "registro" o "editar" 
    var modoFormulario = "registro";
    //variables globales para tabla de recursos
    var listaCategorias = [];

    //la que se va acotando segun la categoria
    var listaModelos = [];
    //la que tiene la lista completa de modelos
    var listaModelosCompleta = [];

    var listaUbicaciones = [];

    //PARA RECURSOS
    var idRecursoActual = null;   // null si es nuevo
    var modoRecurso = "nuevo";    // "nuevo" o "editar"

    //Websockets
    var conexionWS = null;

    /*=======================================
      FUNCIÓN PARA CAMBIAR ENTRE PANTALLAS APP (ENTRE DIV)
    ========================================*/
   function cambiarSeccion(seccion){
    console.log("Cambiando de sección:", seccionActual, "->", seccion);
    document.getElementById(seccionActual).classList.remove("activa");
    document.getElementById(seccion).classList.add("activa");
    seccionActual = seccion;


    }

    /*=======================================
      FUNCIÓN PARA VOLVER AL LISTADO: recurso -> inicio, actualizando tabla 
      por si hay cambios de alguno de los recursos
    ========================================*/

    function volverAlListado(){
      cambiarSeccion("inicio");
      buscar(); // repinta la tabla con el recurso actualizado
    }


    /*=======================================
      FUNCIÓN PARA ACCEDER AL INICIO:  LOGIN -> INICIO.
      - método post: api/gestores/login con usuario y 
        password del gestor
    ========================================*/

    
function entrar(){

    var usuario = document.getElementById("usuarioLogin").value;
    var password = document.getElementById("passwordLogin").value;

    console.log("Intentando login con usuario:", usuario);

    fetch("/api/gestores/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            login: usuario,
            password: password
        })
    })

    .then(function(response){

        console.log("Respuesta login status:", response.status);

        if(response.status === 200){
            return response.json(); // Ahora recibimos { id, token }
        } else if(response.status === 403){
            throw new Error("Login incorrecto");
        } else {
            throw new Error("Error inesperado en login");
        }
    })

    .then(function(datos){

        // Guardamos el ID del gestor y el JWT
        idGestorActual = datos.id;
        tokenGestorActual = datos.token;

        clearTimeout(temporizadorSesion);

        temporizadorSesion = setTimeout(function() {
            sesionCaducada();
        }, 60 * 60 * 1000);

        console.log("Login correcto. idGestorActual =", idGestorActual);
        console.log("Token recibido correctamente:", tokenGestorActual != null);

        // Ahora pedimos los datos del gestor
        return fetch(ConToken("/api/gestores/" + idGestorActual));
    })

    .then(function(response){

        if (response.status !== 200) {
            throw new Error("Error obteniendo los datos del gestor");
        }

        return response.json();
    })

    .then(function(gestor){

        console.log("Datos gestor recibidos:", gestor);

        document.getElementById("textoBienvenida").innerHTML =
            "Bienvenido " + gestor.nombre + " " + gestor.apellidos;

        // WebSockets
        conectarWebSocketGestor(gestor.nombre + " " + gestor.apellidos);

        cargarFiltros();
        cambiarSeccion("inicio");
        obtenerDatosMinisterio();

        // Tabla vacía al entrar
        document.getElementById("tablaRecursos").innerHTML = "";

    })

    .catch(function(error){

        console.log("Fallo login:", error.message);
        alert("Error al iniciar sesión: " + error.message);

    });
}


    /*=======================================
      FUNCIÓN PARA REGISTRARSE: login -> registro/modificacion de datos.
    ========================================*/

    function registro() {
        console.log("Abriendo formulario de registro");

        modoFormulario = "registro";
        idGestorActual = null;
        tokenGestorActual = null;
        clearTimeout(temporizadorSesion);
        temporizadorSesion = null;

        document.getElementById("nombreRegistro").value = "";
        document.getElementById("apellidosRegistro").value = "";
        document.getElementById("usuarioRegistro").value = "";
        document.getElementById("passwordRegistro").value = "";
        
    cambiarSeccion("registroModificacion")
    }

    function esNombreOApellidosValido(texto){
      if (texto == null) return false;
      if (typeof texto !== "string") return false;

      var t = texto.trim();
      if (t.length < 2) return false;

      // Solo letras (incluye tildes/ñ), espacios y opcionalmente guion/apóstrofo
      var patron = /^[\p{L}]+(?:[ \-'][\p{L}]+)*$/u;
      return patron.test(t);
    }


     /*=======================================
      FUNCIÓN PARA GUARDAR DATOS DE: registro/modificacion de datos.
      - método post:  /api/gestores para registrar a un nuevo gestor.
      - método put:   /api/gestores para modificar algun dato de gestor ya registrado.
    ========================================*/

    function guardar(){

    var nombre = document.getElementById("nombreRegistro").value;
    var apellidos = document.getElementById("apellidosRegistro").value;
    var usuario = document.getElementById("usuarioRegistro").value;
    var password = document.getElementById("passwordRegistro").value;

    console.log("Guardar. modoFormulario =", modoFormulario);

    // Validación mínima
    if(nombre === "" || apellidos === "" || usuario === "" || password === ""){
        alert("Rellena todos los campos");
        return;
    }

    // Validación nombre y apellidos (sin números ni caracteres raros)
    if (!esNombreOApellidosValido(nombre)) {
      alert("Nombre inválido: solo letras y espacios (sin números ni símbolos)");
      return;
    }
    if (!esNombreOApellidosValido(apellidos)) {
      alert("Apellidos inválidos: solo letras y espacios (sin números ni símbolos)");
      return;
    }

// Normalizar (quita espacios al principio/final)
nombre = nombre.trim();
apellidos = apellidos.trim();

    // CASO 1: REGISTRO NUEVO
    if(modoFormulario === "registro"){

        console.log("POST /api/gestores (registro)");

        fetch("/api/gestores", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nombre: nombre,
                apellidos: apellidos,
                usuario: usuario,
                password: password
            })
        })
        .then(function(response){
            console.log("Respuesta registro status:", response.status);

            if(response.status === 201){
                return response.json(); // { id: ... }
            }
            else if(response.status === 403){
                throw new Error("Usuario ya existe");
            }
            else{
                throw new Error("Error en registro");
            }
        })
        .then(function(data){
            console.log("Registro correcto. Nuevo id =", data.id);

            alert("Registrado correctamente. Ahora puedes iniciar sesión.");

            cambiarSeccion("login");
        })
        .catch(function(error){
            console.log("Error registro:", error.message);

            if(error.message === "Usuario ya existe"){
                alert("Ese usuario ya existe. Prueba otro.");
            } else {
                alert("Error al registrar");
            }
        });

    }

    // CASO 2: EDITAR DATOS
    else if(modoFormulario === "editar"){

        console.log("PUT /api/gestores/" + idGestorActual);

        fetch(ConToken("/api/gestores/" + idGestorActual), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: nombre,
            apellidos: apellidos,
            usuario: usuario,
            password: password
          })
        })
        .then(function(response){
          console.log("Respuesta edición status:", response.status);

          if (response.status === 200) {
            return response.text(); // "OK" o "Nada ha sido modificado"
          } else if (response.status === 403) {
            throw new Error("Usuario ya existe");
          } else if (response.status === 404) {
            throw new Error("Gestor no existe");
          } else {
            throw new Error("Error en edición");
          }
        })
        .then(function(txt){
            if (txt === "OK") {
              alert("Datos actualizados correctamente");

              // Volvemos a pedir los datos actualizados del gestor
              fetch(ConToken("/api/gestores/" + idGestorActual))
                .then(function(r){
                  if (r.status !== 200) throw new Error("No se pudo recargar el gestor");
                  return r.json();
                })
                .then(function(gestor){
                  document.getElementById("textoBienvenida").innerHTML =
                    "Bienvenido " + gestor.nombre + " " + gestor.apellidos;

                  cambiarSeccion("inicio");
                })
                .catch(function(e){
                  console.log(e.message);
                  cambiarSeccion("inicio");
                });

            } 
            else if (txt === "Nada ha sido modificado") {
              alert("Nada ha sido modificado");
            }
          })
        .catch(function(error){
          console.log("Error edición:", error.message);

          if (error.message === "Usuario ya existe") {
            alert("Ese usuario ya existe. Prueba otro.");
          } else if (error.message === "Gestor no existe") {
            alert("Gestor no existe");
          } else {
            alert("Error al actualizar datos");
          }
        });
    }

}

   /*=======================================
      FUNCIÓN PARA CANCELAR: registro/modificacion de datos.
    ========================================*/

    function cancelar(){
      console.log("Cancelar formulario. modoFormulario =", modoFormulario);

      if (modoFormulario === "editar") {
        cambiarSeccion("inicio");
      } else {
        cambiarSeccion("login");
      }
    }

    function datosUsuario(){
        var usuario = document.getElementById("usuarioLogin").value;
        //...
    }

    /*=======================================
      FUNCIÓN PARA SALIR DE LA SESIÓN: de inicio o recurso a login
    ========================================*/

    function salir(){

        console.log("Salir. Cerrando sesión. idGestorActual era:", idGestorActual);

        if (conexionWS != null) {
        conexionWS.close();
        conexionWS = null;
        }

        
        // Cancelamos el temporizador de caducidad
        clearTimeout(temporizadorSesion);
        temporizadorSesion = null;

        idGestorActual = null;
        tokenGestorActual = null;
        modoFormulario = "registro";


        cambiarSeccion("login");
   
    }

    /*=======================================
      FUNCIÓN PARA EDITAR DATOS
    ========================================*/

    function editarDatos(){
    if(idGestorActual == null){
        alert("No hay ningún gestor logueado");
        return;
    }

    console.log("Editar datos de gestor id =", idGestorActual);

    modoFormulario = "editar";

    fetch(ConToken("/api/gestores/" + idGestorActual))
    .then(function(response){
        console.log("GET gestor status:", response.status);
        if(response.status === 200){
            return response.json();
        } else {
            throw new Error("No se pudo cargar el gestor");
        }
    })
    .then(function(gestor){
        console.log("Datos gestor recibidos:", gestor);

        // Rellenar el formulario con sus datos actuales
        document.getElementById("nombreRegistro").value = gestor.nombre;
        document.getElementById("apellidosRegistro").value = gestor.apellidos;
        document.getElementById("usuarioRegistro").value = gestor.usuario;

        // La contraseña no la devuelve el GET (y mejor así).
        // Tú decides: o la dejas vacía para que la vuelva a escribir:
        document.getElementById("passwordRegistro").value = "";

        cambiarSeccion("registroModificacion");
    })
    .catch(function(error){
        console.log(error.message);
        alert("Error cargando datos del gestor");
    });
}

/*=======================================
      FUNCIÓN PARA CARGAR LOS FILTROS
    ========================================*/


function cargarFiltros() {
  console.log("Cargando filtros...");

  // ESTADO (fijo)
  var selEstado = document.getElementById("filtroEstado");
  selEstado.innerHTML = "";
  selEstado.innerHTML += '<option value="">Todos</option>'; //voy añadiendo las opciones de estado del recurso
  selEstado.innerHTML += '<option value="0">Operativo</option>';
  selEstado.innerHTML += '<option value="1">Baja/defectuoso</option>';
  selEstado.innerHTML += '<option value="2">Mantenimiento</option>';

  // CATEGORÍAS
  fetch(ConToken("/api/categorias"))
    .then(function(r){ return r.json(); })
    .then(function(lista){
      listaCategorias = lista;

      var sel = document.getElementById("filtroCategoria");
      sel.innerHTML = '<option value="">Todos</option>';
      for (var i = 0; i < lista.length; i++) {
        sel.innerHTML += '<option value="' + lista[i].id + '">' + lista[i].nombre + "</option>";
      }

      console.log("Categorías cargadas:", listaCategorias.length);
    });

  // MODELOS
  fetch(ConToken("/api/modelos"))
    .then(function(r){ return r.json(); })
    .then(function(lista){
      listaModelosCompleta = lista;
      listaModelos = lista;
      rellenarSelectModelos(listaModelos);

      console.log("Modelos cargados:", listaModelosCompleta.length);
    });

  // UBICACIONES
  fetch(ConToken("/api/ubicaciones")) 
    .then(function(r){ return r.json(); })
    .then(function(lista){
      listaUbicaciones = lista;
      var sel = document.getElementById("filtroUbicacion");
      sel.innerHTML = '<option value="">Todos</option>';
      for (var i = 0; i < lista.length; i++) {
        sel.innerHTML += '<option value="' + lista[i].id + '">' + lista[i].nombre + "</option>";
      }

      console.log("Ubicaciones cargadas:", listaUbicaciones.length);
    });
}


function rellenarSelectModelos(lista) {
  var sel = document.getElementById("filtroModelo");
  sel.innerHTML = '<option value="">Todos</option>';

  for (var i = 0; i < lista.length; i++) {
    sel.innerHTML += '<option value="' + lista[i].id + '">' + lista[i].nombre + "</option>";
  }
}

function categoriaCambiada() {
  var categoriaSeleccionada = document.getElementById("filtroCategoria").value;
  console.log("Categoría cambiada a:", categoriaSeleccionada);

  // Si es "Todos", se muestran todos los modelos
  if (categoriaSeleccionada === "") {
    listaModelos = listaModelosCompleta;
    rellenarSelectModelos(listaModelos);
    return;
  }

  // Filtrar modelos por esa categoría
  var filtrados = [];
  for (var i = 0; i < listaModelosCompleta.length; i++) {
    if (listaModelosCompleta[i].categoria === parseInt(categoriaSeleccionada)) {
      filtrados.push(listaModelosCompleta[i]);
    }
  }

  listaModelos = filtrados;
  rellenarSelectModelos(listaModelos);

  // (Opcional) resetear el modelo seleccionado
  document.getElementById("filtroModelo").value = "";
}


/*=======================================
      FUNCIÓN PARA CREAR LA TABLA DE RECURSOS
    ========================================*/

function pintarTablaRecursos(lista) {
  var tbody = document.getElementById("tablaRecursos");
  tbody.innerHTML = ""; // limpia la tabla

  for (var i = 0; i < lista.length; i++) {
    var r = lista[i];

    // Sacar modelo y, desde el modelo, la categoría
    var modelo = obtenerModeloPorId(r.modelo);
    var nombreModelo = modelo ? modelo.nombre : "";
    var nombreCategoria = modelo ? obtenerCategoriaNombrePorId(modelo.categoria) : "";

    var nombreUbicacion = obtenerUbicacionNombrePorId(r.ubicacion);
    var textoEstado = estadoATexto(r.estado);

    // usamos r.id internamente, pero NO lo mostramos
    tbody.innerHTML +=
      "<tr>" +
        "<td>" + r.numero_serie + "</td>" +
        "<td>" + nombreCategoria + "</td>" +
        "<td>" + nombreModelo + "</td>" +
        "<td>" + nombreUbicacion + "</td>" +
        "<td>" + textoEstado + "</td>" +
        '<td><button onclick="abrirRecurso(' + r.id + ')">Abrir</button></td>' +
        '<td><button onclick="borrarRecurso(' + r.id + ', \'' + r.numero_serie + '\')">X</button></td>' +
      "</tr>";
  }
}


/*=======================================
      FUNCIÓN PARA BOTON BUSCAR
    ========================================*/

function buscar() {
  console.log("Buscando recursos...");

  var categoria = document.getElementById("filtroCategoria").value;
  var modelo = document.getElementById("filtroModelo").value;
  var ubicacion = document.getElementById("filtroUbicacion").value;
  var estado = document.getElementById("filtroEstado").value;

  var params = [];

  if (categoria !== "") params.push("categoria=" + categoria);
  if (modelo !== "") params.push("modelo=" + modelo);
  if (ubicacion !== "") params.push("ubicacion=" + ubicacion);
  if (estado !== "") params.push("estado=" + estado);

  var url = "/api/recursos";

  if (params.length > 0) {
    url += "?" + params.join("&");
  }

  console.log("URL final:", url);

  fetch(ConToken(url))
    .then(function(r){ return r.json(); })
    .then(function(lista){
      console.log("Recursos recibidos:", lista);
      pintarTablaRecursos(lista);
    });
}


/*=======================================
      FUNCIONES PARA OBTENER MODELO/CATEGORIA/UBICACION DESDE ID
    ========================================*/

function obtenerModeloPorId(idModelo) {
  for (var i = 0; i < listaModelosCompleta.length; i++) {
    if (listaModelosCompleta[i].id === idModelo) return listaModelosCompleta[i];
  }
  return null;
}

function obtenerCategoriaNombrePorId(idCategoria) {
  for (var i = 0; i < listaCategorias.length; i++) {
    if (listaCategorias[i].id === idCategoria) return listaCategorias[i].nombre;
  }
  return "";
}

function obtenerUbicacionNombrePorId(idUbicacion) {
  for (var i = 0; i < listaUbicaciones.length; i++) {
    if (listaUbicaciones[i].id === idUbicacion) return listaUbicaciones[i].nombre;
  }
  return "";
}


function estadoATexto(estado) {
  if (estado === 0) return "Operativo";
  if (estado === 1) return "Baja/defectuoso";
  if (estado === 2) return "Mantenimiento";
  return "";
}

//para rellenar selects segun recurso seleccionado
function rellenarSelectsRecurso() {

  // ---- CATEGORÍAS ----
  var selCat = document.getElementById("selectCategoriaRecurso");
  selCat.innerHTML = "";

  for (var i = 0; i < listaCategorias.length; i++) {
    selCat.innerHTML +=
      '<option value="' + listaCategorias[i].id + '">' +
      listaCategorias[i].nombre +
      "</option>";
  }

  // ---- UBICACIONES ----
  var selUbi = document.getElementById("selectUbicacionRecurso");
  selUbi.innerHTML = "";

  for (var j = 0; j < listaUbicaciones.length; j++) {
    selUbi.innerHTML +=
      '<option value="' + listaUbicaciones[j].id + '">' +
      listaUbicaciones[j].nombre +
      "</option>";
  }

  // ---- MODELOS (según categoría seleccionada) ----
if (listaCategorias.length > 0) {
  selCat.value = String(listaCategorias[0].id);  // fuerza una selección válida
  rellenarModelosSegunCategoria(parseInt(selCat.value));
}
}


// Se ejecuta cuando cambias la categoría 
function categoriaRecursoCambiada() {
  var idCat = parseInt(document.getElementById("selectCategoriaRecurso").value);
  rellenarModelosSegunCategoria(idCat);
}


// Rellena el select de modelos según categoría
function rellenarModelosSegunCategoria(idCategoria) {

  var selMod = document.getElementById("selectModeloRecurso");
  selMod.innerHTML = "";

  for (var i = 0; i < listaModelosCompleta.length; i++) {
    if (listaModelosCompleta[i].categoria === parseInt(idCategoria)) {
      selMod.innerHTML +=
        '<option value="' + listaModelosCompleta[i].id + '">' +
        listaModelosCompleta[i].nombre +
        "</option>";
    }
  }
} 


/* =========================================================
   AÑADIR RECURSO (modo nuevo)
   ========================================================= */

function anadirRecurso() {
  modoRecurso = "nuevo";
  idRecursoActual = null;

  rellenarSelectsRecurso();

  document.getElementById("inputNumeroSerieRecurso").value = "";
  document.getElementById("selectEstadoRecurso").value = "0";

  document.getElementById("tablaReservasRecurso").innerHTML = "";
  document.getElementById("tablaResenyasRecurso").innerHTML = "";

  cambiarSeccion("recurso");
}


/* =========================================================
   ABRIR RECURSO (modo editar)
   ========================================================= */

function abrirRecurso(id) {
  modoRecurso = "editar";
  idRecursoActual = id;

  // 1) Rellenar selects base (categorías/ubicaciones) para que existan opciones
  rellenarSelectsRecurso();

  // 2) Cargar datos del recurso
  fetch(ConToken("/api/recursos/" + id))
    .then(function (r) {
      if (r.status === 404) throw new Error("Recurso no existe");
      return r.json();
    })
    .then(function (recurso) {
      // --- cargar campos simples ---
      document.getElementById("inputNumeroSerieRecurso").value = recurso.numero_serie;
      document.getElementById("selectUbicacionRecurso").value = String(recurso.ubicacion);
      document.getElementById("selectEstadoRecurso").value = String(recurso.estado);

      // --- ajustar categoría/modelo según el modelo del recurso ---
      var mod = obtenerModeloPorId(recurso.modelo);
      var idCat = mod ? mod.categoria : (listaCategorias.length > 0 ? listaCategorias[0].id : 1);

      document.getElementById("selectCategoriaRecurso").value = String(idCat);
      rellenarModelosSegunCategoria(idCat);
      document.getElementById("selectModeloRecurso").value = String(recurso.modelo);

      // 3) Ahora cargar reservas del recurso
      return fetch(ConToken("/api/recursos/" + id + "/reservas"));
    })
    .then(function (r) {
      return r.json();
    })
    .then(function (listaReservas) {
      pintarReservasRecurso(listaReservas);

      // 4) Ahora cargar reseñas del recurso
      return fetch(ConToken("/api/recursos/" + id + "/resenyas"));
    })
    .then(function (r) {
      return r.json();
    })
    .then(function (listaResenyas) {
      pintarResenyasRecurso(listaResenyas);
     
      // 5) Cuando ya está todo, mostramos la pantalla
      cambiarSeccion("recurso");
    })
    .catch(function (e) {
      alert(e.message);
    });
}


/*=======================================
      FUNCIÓN PARA BOTÓN DE X: BORRAR UN RECURSO COMPLETO
    ========================================*/

function borrarRecurso(id, numeroSerie) {
  if (!confirm("¿Seguro que quieres borrar el recurso " + numeroSerie + "?")) return;

  fetch(ConToken("/api/recursos/" + id), { method: "DELETE" })
    .then(function(r){
      if (r.status === 200) return r.text();
      if (r.status === 404) throw new Error("Recurso no existe");
      throw new Error("Error borrando recurso");
    })
    .then(function(){
      buscar(); // refresca tabla
    })
    .catch(function(e){
      alert(e.message);
    });
}

/*=======================================
      FUNCIÓN PARA BOTÓN GUARDAR 
    ========================================*/
function guardarRecurso() {
  var idModelo = document.getElementById("selectModeloRecurso").value;
  var idUbicacion = document.getElementById("selectUbicacionRecurso").value;
  var numeroSerie = document.getElementById("inputNumeroSerieRecurso").value;
  var estado = document.getElementById("selectEstadoRecurso").value;

  console.log("[guardarRecurso] modoRecurso =", modoRecurso, 
        "idRecursoActual =", idRecursoActual);

  console.log("[guardarRecurso] datos formulario:", {
        modelo: idModelo,
        ubicacion: idUbicacion,
        numero_serie: numeroSerie,
        estado: estado
      });

  if (numeroSerie.trim() === "") {
    alert("El número de serie no puede estar vacío");
    return;
  }

  var body = {
    modelo: idModelo,
    ubicacion: idUbicacion,
    numero_serie: numeroSerie,
    estado: estado
  };

  // CASO 1: NUEVO
  if (modoRecurso === "nuevo") {

    console.log("[guardarRecurso] POST /api/recursos body =", body);
    fetch(ConToken("/api/recursos"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
    .then(function(r){
      console.log("[guardarRecurso][POST] status =", r.status);
      if (r.status === 400) return r.text().then(function(t){ throw new Error(t); });
      if (r.status !== 201 && r.status !== 200) return r.text().then(function(t){ throw new Error(t); });
      return r.json();
    })

    .then(function (nuevo) {
      console.log("[guardarRecurso][POST] recurso creado =", nuevo);
      alert("Recurso creado");
      modoRecurso = "editar";
      idRecursoActual = nuevo.id;

      //Websockets
      if (conexionWS != null) {
        conexionWS.send(JSON.stringify({
          operacion: "nuevoRecurso",
          recurso: nuevo
        }));
      }

      // En un recurso recién creado NO habrá reservas/reseñas
      document.getElementById("tablaReservasRecurso").innerHTML = "";
      document.getElementById("tablaResenyasRecurso").innerHTML = "";

      buscar();
    })
    .catch(function (e) {
      alert("Error creando recurso: " + e.message);
    });

  // CASO 2: EDITAR
  }else {
    console.log("[guardarRecurso] PUT /api/recursos/" + idRecursoActual, "body =", body);
    fetch(ConToken("/api/recursos/" + idRecursoActual), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })

    //error
    .then(function(r){
      console.log("[guardarRecurso][PUT] status =", r.status);
      if (r.status === 200) return r.json();
      return r.text().then(function(t){ throw new Error(t); });
    })


    //se ha actualizado el recurso
    .then(function(recursoActualizado){
      console.log("[guardarRecurso][PUT] recurso actualizado =", recursoActualizado);
      alert("Recurso actualizado");
      return fetch(ConToken("/api/recursos/" + idRecursoActual + "/reservas"));
    })

    .then(function(r){
    return r.json();
    })

    //lista de reservas del recurso 
    .then(function(listaReservas){
      pintarReservasRecurso(listaReservas);

      return fetch(ConToken("/api/recursos/" + idRecursoActual + "/resenyas"));
    })
    .then(function(r){
      return r.json();
    })

    //lista de reseñas del recurso
    .then(function(listaResenyas){
      pintarResenyasRecurso(listaResenyas);
    })
    .catch(function(e){
      alert(e.message);
    });
    }
  }

  function pintarReservasRecurso(listaReservas) {
  var tbody = document.getElementById("tablaReservasRecurso");
  tbody.innerHTML = "";

  var ahora = new Date(); // para comparar si va tarde o no

  for (var i = 0; i < listaReservas.length; i++) {
    var r = listaReservas[i];

    // --------- calcular clase según estado ---------
    /*  pendiente: fecha_inicio == null
        en uso: fecha_inicio != null && fecha_fin == null
        finalizada: fecha_fin != null
    */
    var clase = "reserva-finalizada"; // por defecto blanco

    var fIni = (r.fecha_inicio ? new Date(r.fecha_inicio) : null);
    var fFin = (r.fecha_fin ? new Date(r.fecha_fin) : null);

    if (fFin != null) {
      clase = "reserva-finalizada"; // blanco
    } else if (fIni == null) {
      clase = "reserva-pendiente"; // verde
    } else {
      var horas = (r.horas_estimadas != null ? parseFloat(r.horas_estimadas) : 0);
      var limite = new Date(fIni.getTime() + horas * 60 * 60 * 1000);

      if (horas > 0 && ahora > limite) clase = "reserva-en-uso-tarde"; // rojo
      else clase = "reserva-en-uso-ok"; // azul
    }

    // --------- pintar fila de reserva---------
    tbody.innerHTML +=
      '<tr class="' + clase + '">' +
        "<td>" + (r.sanitario || "") + "</td>" +
        "<td>" + (r.horas_estimadas != null ? r.horas_estimadas : "") + "</td>" +
        "<td>" + formatearFecha(r.fecha_peticion) + "</td>" +
        "<td>" + formatearFecha(r.fecha_inicio) + "</td>" +
        "<td>" + formatearFecha(r.fecha_fin) + "</td>" +
      "</tr>";
  }
}


  function pintarResenyasRecurso(listaResenyas) {
    var tbody = document.getElementById("tablaResenyasRecurso");
    tbody.innerHTML = "";

    for (var i = 0; i < listaResenyas.length; i++) {
      var r = listaResenyas[i];

      tbody.innerHTML +=
        "<tr>" +
          "<td>" + formatearFecha(r.fecha) + "</td>" +
          "<td>" + (r.sanitario || "") + "</td>" +
          "<td>" + (r.valor != null ? r.valor : "") + "</td>" +
          "<td>" + (r.descripcion || "") + "</td>" +
        "</tr>";
    }
  }




// Formatea ISO a algo legible
function formatearFecha(valor) {
  if (valor == null || valor === "") return "";
  var d = new Date(valor);
  if (isNaN(d.getTime())) return String(valor);
  return d.toLocaleString();
}

//WebSockets
function conectarWebSocketGestor(nombreGestor) {
    conexionWS = new WebSocket("ws://localhost:4444", "avisos");

    conexionWS.addEventListener("open", function () {
        console.log("WebSocket gestor conectado");

        conexionWS.send(JSON.stringify({
            operacion: "identificar",
            tipo: "gestor",
            id: idGestorActual,
            nombre: nombreGestor
        }));
    });

    conexionWS.addEventListener("message", function (msg) {
        var aviso = JSON.parse(msg.data);
        pintarAviso(aviso);
    });

    conexionWS.addEventListener("close", function () {
        console.log("WebSocket gestor cerrado");
    });
}

function pintarAviso(aviso) {
  var tbody = document.getElementById("tablaAvisos");

  var colorFondo = "";

  if (aviso.color === "azul") {
    colorFondo = "background-color: #b9d7ff;";
  } else if (aviso.color === "rojo") {
    colorFondo = "background-color: #ffb3b3;";
  } else if (aviso.color === "verde") {
    colorFondo = "background-color: #b7f7b7;";
  }

  tbody.innerHTML +=
    '<tr style="' + colorFondo + '">' +
      "<td>" + formatearFecha(aviso.fecha) + "</td>" +
      "<td>" + aviso.origen + "</td>" +
      "<td>" + aviso.texto + "</td>" +
    "</tr>";
}




/* ===========================================
   PRÁCTICA 3 - ENVÍO DE RESERVAS AL MINISTERIO
=========================================== */

// Evita que se realicen varios envíos a la vez
var enviandoReservas = false;


/* ===========================================
   1. OBTENER TODAS LAS RESERVAS
=========================================== */

function obtenerTodasReservas() {

    if (enviandoReservas) {
        alert("Ya se está realizando un envío");
        return;
    }

    enviandoReservas = true;

    // Primero obtenemos todos los recursos
    rest.get(ConToken("/api/recursos"), function(estado, recursos) {

        if (estado !== 200 || !Array.isArray(recursos)) {
            alert("Error obteniendo los recursos");
            enviandoReservas = false;
            return;
        }

        var todasReservas = [];
        var recursosProcesados = 0;
        var errorReservas = false;

        if (recursos.length === 0) {
            alert("No hay recursos");
            enviandoReservas = false;
            return;
        }

        // Recorremos todos los recursos
        for (var i = 0; i < recursos.length; i++) {

            var recurso = recursos[i];

            // Obtenemos las reservas de cada recurso
            rest.get(ConToken("/api/recursos/" + recurso.id + "/reservas"),
                function(estadoReservas, reservas) {

                    if (estadoReservas === 200 && Array.isArray(reservas)) {

                        // Añadimos las reservas al array general
                        for (var j = 0; j < reservas.length; j++) {
                            todasReservas.push(reservas[j]);
                        }

                    } else {
                        console.log("Error obteniendo reservas");
                        errorReservas = true;
                    }

                    recursosProcesados++;

                    // Esperamos a que terminen todas las peticiones
                    if (recursosProcesados === recursos.length) {

                        if (errorReservas) {
                            alert("No se han podido recuperar todas las reservas");
                            enviandoReservas = false;
                            return;
                        }

                        console.log("Todas las reservas:", todasReservas);

                        prepararReservasMinisterio(todasReservas, recursos);
                    }
                }
            );
        }
    });
}


/* ===========================================
   2. FORMATEAR FECHAS PARA EL MINISTERIO
=========================================== */

function fechaMinisterio(fecha) {

    // Si la fecha es null, se mantiene null
    if (fecha == null) {
        return null;
    }

    // Conservamos YYYY-MM-DD
    return String(fecha).substring(0, 10);
}


/* ===========================================
   3. PREPARAR LAS RESERVAS PARA EL MINISTERIO
=========================================== */

function prepararReservasMinisterio(reservas, recursos) {

    if (reservas.length === 0) {
        alert("No hay reservas para enviar");
        enviandoReservas = false;
        return;
    }

    // Obtenemos todos los modelos
    rest.get(ConToken("/api/modelos"), function(estadoModelos, modelos) {

        if (estadoModelos !== 200 || !Array.isArray(modelos)) {
            alert("Error obteniendo modelos");
            enviandoReservas = false;
            return;
        }

        // Obtenemos todas las categorías
        rest.get(ConToken("/api/categorias"), function(estadoCategorias, categorias) {

            if (estadoCategorias !== 200 || !Array.isArray(categorias)) {
                alert("Error obteniendo categorías");
                enviandoReservas = false;
                return;
            }

            var datosMinisterio = [];
            var reservasProcesadas = 0;
            var errorDatos = false;

            // Recorremos todas las reservas
            for (var i = 0; i < reservas.length; i++) {

                var reserva = reservas[i];

                consultarSanitario(reserva);
            }

            // Función para consultar los datos del sanitario
            function consultarSanitario(reserva) {

                rest.get(ConToken("/api/sanitarios/" + reserva.idSanitario),
                    function(estadoSanitario, sanitario) {

                        if (estadoSanitario !== 200 || !sanitario ||
                            !sanitario.nombre || !sanitario.apellidos) {

                            console.log("Error obteniendo sanitario");
                            errorDatos = true;

                        } else {

                            // Buscamos el recurso de esta reserva
                            var recurso = recursos.find(function(r) {
                                return Number(r.id) === Number(reserva.idRecurso);
                            });

                            // Buscamos su modelo
                            var modelo = modelos.find(function(m) {
                                return recurso &&
                                    Number(m.id) === Number(recurso.modelo);
                            });

                            // Buscamos la categoría del modelo
                            var categoria = categorias.find(function(c) {
                                return modelo &&
                                    Number(c.id) === Number(modelo.categoria);
                            });

                            // Comprobamos que existe la categoría
                            if (!categoria || !categoria.nombre) {

                                console.log("Error: categoría no encontrada");
                                errorDatos = true;

                            } else {

                                // Construimos el objeto de la reserva
                                var nuevaReserva = {
                                    nombre: sanitario.nombre,
                                    apellidos: sanitario.apellidos,
                                    categoria: categoria.nombre,
                                    horas_estimadas: reserva.horas_estimadas,
                                    fec_pet: fechaMinisterio(reserva.fecha_peticion),
                                    fec_ini: fechaMinisterio(reserva.fecha_inicio),
                                    fecha_fin: fechaMinisterio(reserva.fecha_fin)
                                };

                                datosMinisterio.push(nuevaReserva);
                            }
                        }

                        reservasProcesadas++;

                        // Cuando se han procesado todas las reservas
                        if (reservasProcesadas === reservas.length) {

                            if (errorDatos ||
                                datosMinisterio.length !== reservas.length) {

                                alert("Error preparando las reservas. No se enviarán datos incompletos");
                                enviandoReservas = false;
                                return;
                            }

                            // Creamos el objeto final
                            var hoy = new Date();

                            var fechaActual =
                                hoy.getFullYear() + "-" +
                                String(hoy.getMonth() + 1).padStart(2, "0") + "-" +
                                String(hoy.getDate()).padStart(2, "0");

                            var envioMinisterio = {
                                id_area: 16,
                                fecha: fechaActual,
                                datos: datosMinisterio
                            };

                            console.log(
                                "Objeto completo para enviar al Ministerio:",
                                envioMinisterio
                            );

                            // Realizamos el POST
                            enviarAlMinisterio(envioMinisterio);
                        }
                    }
                );
            }
        });
    });
}


/* ===========================================
   4. ENVIAR RESERVAS AL MINISTERIO (POST)
=========================================== */

function enviarAlMinisterio(envioMinisterio) {

    rest.post("https://undefined.ua.es/telemedicina/api/datos", envioMinisterio, function(estado, respuesta) {

            enviandoReservas = false;

            if (estado >= 200 && estado < 300) {

                console.log("Respuesta del Ministerio:", respuesta);

                alert("Reservas enviadas correctamente al Ministerio");

            } else {

                console.log("Error del Ministerio:", estado, respuesta);

                alert("Error al enviar las reservas al Ministerio");
            }
        }
    );
}



/* ===========================================
   PRÁCTICA 3 - CONSULTAR DATOS DEL MINISTERIO
=========================================== */

/* ===========================================
   PRÁCTICA 3 - GET Y RANKING DEL MINISTERIO
=========================================== */

function obtenerDatosMinisterio() {

    rest.get("https://undefined.ua.es/telemedicina/api/datos", function(estado, respuesta) {

            if (estado === 200 && Array.isArray(respuesta)) {

                console.log("Datos recibidos del Ministerio:", respuesta);

                var ranking = {};

                // Recorremos todos los envíos del Ministerio
                for (var i = 0; i < respuesta.length; i++) {

                    var registro = respuesta[i];

                    var idArea = registro.id_area;

                    // Contamos las reservas que contiene este envío
                    var cantidad = Array.isArray(registro.datos)
                        ? registro.datos.length
                        : 0;

                    // Si el área todavía no existe en el ranking
                    if (ranking[idArea] == null) {
                        ranking[idArea] = 0;
                    }

                    // Acumulamos las reservas de esa área
                    ranking[idArea] += cantidad;
                }

                console.log("Ranking de reservas por área:", ranking);
                pintarRanking(ranking);

            } else {
                console.log("Error al consultar el Ministerio:", estado);
                alert("Error al obtener los datos del Ministerio");
            }
        }
    );
}




var nombresAreas = {
    1: "Alergología",
    2: "Anestesiología",
    3: "Cardiología",
    4: "Cirugía General",
    5: "Dermatología",
    6: "Aparato Digestivo",
    7: "Endocrinología",
    8: "Ginecología",
    9: "Hematología",
    10: "Medicina Interna",
    11: "Neumología",
    12: "Neurología",
    13: "Oftalmología",
    14: "Oncología",
    15: "Pediatría",
    16: "Psiquiatría",
    17: "Traumatología",
    18: "Urología"
};




function pintarRanking(ranking) {

    var tbody = document.getElementById("tablaRanking");
    tbody.innerHTML = "";

    var listaRanking = [];

    // Convertimos el objeto ranking en un array
    for (var idArea in ranking) {

        // Comprobamos si conocemos el área médica
        var nombreArea;

        if (nombresAreas[idArea] != null) {
            nombreArea = nombresAreas[idArea];
        } else {
            nombreArea = "Área desconocida (ID: " + idArea + ")";
        }

        listaRanking.push({
            id_area: Number(idArea),
            nombre: nombreArea,
            total: ranking[idArea]
        });
    }

    // Ordenamos de mayor a menor número de reservas
    listaRanking.sort(function(a, b) {
        return b.total - a.total;
    });

    // Pintamos las filas
    for (var i = 0; i < listaRanking.length; i++) {

        var area = listaRanking[i];
        var posicion = i + 1;

        if (i === 0) posicion = "🥇";
        else if (i === 1) posicion = "🥈";
        else if (i === 2) posicion = "🥉";

        tbody.innerHTML +=
            "<tr>" +
                "<td>" + posicion + "</td>" +
                "<td>" + area.nombre + "</td>" +
                "<td>" + area.total + "</td>" +
            "</tr>";
    }
}
