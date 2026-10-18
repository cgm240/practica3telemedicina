var conexion = require("./conexion_mysql.js"); //conexion con base de datos mySQL

var express = require("express"); //instacia de la libreria (funcion) a usar => servidor.
var app = express();

var jwt = require("jwt-simple");

// Clave para firmar y verificar los tokens
var clave = "miSecretoMasOscuro";



app.use("/apiGestor", express.static("cliente_rest"));
app.use("/apiSanitario", express.static("cliente_rpc"));
app.use(express.json()); //para que Express pueda interpretar los JSON que mandas en los POST y PUT mediante req.body

function esNombreOApellidosValido(texto){
  if (texto == null) return false;
  if (typeof texto !== "string") return false;

  var t = texto.trim();
  if (t.length < 2) return false;

  var patron = /^[\p{L}]+(?:[ \-'][\p{L}]+)*$/u;
  return patron.test(t);
}

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/cliente/index.html");
});



/* =========================
   POST: login gestor
   Body: { login, password }
   Devuelve: id (número)

   Login correcto
      ↓
   MySQL encuentra al gestor
      ↓
   gestores[0] (objeto gestor)
      ↓
   gestores[0].id (id de ese gestor)
      ↓
   devuelve su ID al cliente
   ========================= */

app.post("/api/gestores/login", function (req, res) {

    var login = req.body.login;
    var password = req.body.password;

    var sql = "SELECT * FROM gestores WHERE usuario = '" + login +
              "' AND password = '" + password + "'";

    conexion.query(sql, function (err, gestores) {

        if (err) {
            console.log("Error al realizar la select", err);
            res.status(500).json("Error al realizar la consulta");

        } else {

            if (gestores.length === 1) {

                var idGestor = gestores[0].id;

                // Creamos el contenido del token
                var contenido = {
                    usuario: idGestor,
                    expira: Date.now() + 60 * 60 * 1000
                };

                // Generamos el token
                var token = jwt.encode(contenido, clave);

                // Devolvemos el ID del gestor y el token
                res.status(200).json({
                    id: idGestor,
                    token: token
                });

            } else {
                res.status(403).send("Login incorrecto");
            }
        }
    });
});



/* =========================
   POST: Crea un nuevo gestor (registro). Se le 
pasa un objeto con los datos del gestor 
(excepto id). El login tiene que ser único.
   ========================= */
app.post("/api/gestores", function (req, res) {
  var nuevo = req.body;

  if (nuevo == null) return res.status(400).send("Body requerido");

  // Validar campos mínimos
  if (nuevo.nombre == null || nuevo.apellidos == null || nuevo.usuario == null || nuevo.password == null) {
    return res.status(400).send("Faltan campos");
  }

  // Validación nombre/apellidos (sin números ni caracteres raros)
  if (!esNombreOApellidosValido(nuevo.nombre)) {
    return res.status(400).send("Nombre inválido");
  }
  if (!esNombreOApellidosValido(nuevo.apellidos)) {
    return res.status(400).send("Apellidos inválidos");
  }

  // Normalizar guardado
  nuevo.nombre = nuevo.nombre.trim();
  nuevo.apellidos = nuevo.apellidos.trim();

  // Comprobar que el usuario no existe
  var sql = "SELECT * FROM gestores WHERE usuario = '" + nuevo.usuario + "'";

  conexion.query(sql, function (err, gestores) {

    if (err) {
        console.log("Error al realizar la select", err);
        return res.status(500).json("Error al realizar la consulta");
    }

    if (gestores.length > 0) {
        return res.status(403).send("Usuario ya existe");
    }


    // Si no existe, crear el gestor
    var sqlInsert = "INSERT INTO gestores (nombre, apellidos, usuario, password) VALUES ('"
        + nuevo.nombre + "', '"
        + nuevo.apellidos + "', '"
        + nuevo.usuario + "', '"
        + nuevo.password + "')";

    conexion.query(sqlInsert, function (err, resultado) {

      if (err) {
          console.log("Error al realizar el insert", err);
          res.status(500).json("Error al realizar la consulta");
      } else {
          res.status(201).json({ id: resultado.insertId });
      }
    });
  });
});



/* =========================
   MIDDLEWARE: VALIDAR TOKEN JWT
   ========================= */

app.use("/api", function (req, res, next) {

    // Obtenemos el token de la URL
    var token = req.query.token;

    // Comprobamos que se haya enviado
    if (!token) {
        return res.status(401).json("No se ha encontrado token");
    }

    // Decodificamos el token
    var contenidoToken;

    try {
        contenidoToken = jwt.decode(token, clave);
    } catch (error) {
        return res.status(401).json("El token es incorrecto");
    }

    // Comprobamos que tiene la información necesaria
    if (!contenidoToken || !contenidoToken.expira || !contenidoToken.usuario) {
        return res.status(401).json("El formato del token no es adecuado");
    }

    // Comprobamos que no haya caducado
    if (contenidoToken.expira < Date.now()) {
        return res.status(401).json("El token ha expirado");
    }

    // Si todo está correcto, continuamos
    next();
});



/* =========================
   GET: ubicaciones/categorias/modelos
   ========================= */
app.get("/api/ubicaciones", function (req, res) {

  var sql = "SELECT * FROM ubicaciones";

  conexion.query(sql, function (err, ubicaciones) {
    if (err) {
      console.log("Error al realizar la select", err);
      res.status(500).json("Error al realizar la consulta");   
    } else {
      console.log("Ubicaciones:", ubicaciones);
      res.json(ubicaciones);
    }
  });
});

app.get("/api/categorias", function (req, res) {

   var sql = "SELECT * FROM categorias";

   conexion.query(sql, function (err, categorias) {
      if (err) {
          console.log("Error al realizar la select", err);
          res.status(500).json("Error al realizar la consulta");
      } else {
          console.log("Categorias:", categorias);
          res.json(categorias);
      }
    });
});


app.get("/api/modelos", function (req, res) {

  var sql = "SELECT * FROM modelos";

   conexion.query(sql, function (err, modelos) {
      if (err) {
          console.log("Error al realizar la select", err);
          res.status(500).json("Error al realizar la consulta");
      } else {
          console.log("Modelos:", modelos);
          res.json(modelos);
      }
    });
  
});



/* =========================
   PUT: Actualiza los datos del gestor. Se le pasa 
un objeto con los datos a actualizar del 
gestor (excepto id). El login tiene que ser 
único. 
   ========================= */
app.put("/api/gestores/:id", function (req, res) {
  var id = parseInt(req.params.id);
  var datosUpdate = req.body;
   
  // Buscar el gestor
  var sql = "SELECT * FROM gestores WHERE id = " + id;


  conexion.query(sql, function (err, gestores) {

    if (err) {
        console.log("Error al realizar la select", err);
        return res.status(500).json("Error al realizar la consulta");
    }

    // Comprobar que el gestor existe
    if (gestores.length === 0) {
        return res.status(404).send("Gestor no existe");
    }

    var gestor = gestores[0];

    // Validar nombre y apellidos si se quieren modificar
    if (datosUpdate.nombre != null && !esNombreOApellidosValido(datosUpdate.nombre)) {
        return res.status(400).send("Nombre inválido");
    }

    if (datosUpdate.apellidos != null && !esNombreOApellidosValido(datosUpdate.apellidos)) {
        return res.status(400).send("Apellidos inválidos");
    }

    // Si un dato no se quiere modificar, mantenemos el que ya tenía
    if (datosUpdate.nombre == null) datosUpdate.nombre = gestor.nombre;
    if (datosUpdate.apellidos == null) datosUpdate.apellidos = gestor.apellidos;
    if (datosUpdate.usuario == null) datosUpdate.usuario = gestor.usuario;
    if (datosUpdate.password == null) datosUpdate.password = gestor.password;

    datosUpdate.nombre = datosUpdate.nombre.trim();
    datosUpdate.apellidos = datosUpdate.apellidos.trim();

    //Comprobar que el nuevo nombre de usuario que quiere ponerse no lo tenga ya OTRO gestor.
    var sqlUsuario = "SELECT * FROM gestores WHERE usuario = '" +
            datosUpdate.usuario + "' AND id <> " + id;

     conexion.query(sqlUsuario, function (err, gestoresUsuario) {

            if (err) {
                console.log("Error al realizar la select", err);
                return res.status(500).json("Error al realizar la consulta");
            }

            if (gestoresUsuario.length > 0) {
                return res.status(403).send("Usuario ya existe");
            }

            // Actualizar el gestor
            var sqlUpdate = "UPDATE gestores SET "
                + "nombre = '" + datosUpdate.nombre + "', "
                + "apellidos = '" + datosUpdate.apellidos + "', "
                + "usuario = '" + datosUpdate.usuario + "', "
                + "password = '" + datosUpdate.password + "' "
                + "WHERE id = " + id;

            conexion.query(sqlUpdate, function (err) {

                if (err) {
                    console.log("Error al realizar el update", err);
                    res.status(500).json("Error al realizar la consulta");
                } else {
                    res.status(200).send("OK");
                }
            });
        });
    });
});
  

/* =========================
   GET: Obtiene un objeto con los datos de un 
  gestor (no devolver contraseña) 
   ========================= */
app.get("/api/gestores/:id", function (req, res) {

  var id = parseInt(req.params.id);
  var sql = "SELECT id, nombre, apellidos, usuario FROM gestores WHERE id = " + id;

  conexion.query(sql, function(err, gestores) {
     if (err) {
        console.log("Error al realizar la select", err);
        res.status(500).json("Error al realizar la consulta");
     } else {
        if (gestores.length === 1) {
            res.status(200).json(gestores[0]);
            console.log("gestor: ", gestores[0]);
        } else {
            res.status(404).json("Gestor no existe");
        }
     }

    });
});




/* =========================
   GET: Obtiene un objeto con los datos de un 
  sanitario (no devolver el código de acceso) 
   ========================= */
app.get("/api/sanitarios/:id", function (req, res) {

  var id = parseInt(req.params.id);

  var sql = "SELECT id, nombre, apellidos, usuario FROM sanitarios WHERE id = " + id;

   conexion.query(sql, function (err, sanitarios) {
      if (err) {
          console.log("Error al realizar la select", err);
          res.status(500).json("Error al realizar la consulta");
      } else {
          if (sanitarios.length === 1) {
              res.status(200).json(sanitarios[0]);
              console.log("sanitario: ", sanitarios[0]);
          } else {
              res.status(404).json("Sanitario no existe");
          }
      }
  });
});


/* =========================
   GET: obtener recursos (con filtros opcionales)
   /api/recursos?categoria=..&modelo=..&ubicacion=..&estado=..
   ========================= */
app.get("/api/recursos", function (req, res) {

  var categoria = req.query.categoria;  // string o undefined
  var modelo = req.query.modelo;
  var ubicacion = req.query.ubicacion;
  var estado = req.query.estado;

  console.log("GET /api/recursos query:", req.query);

  var sql = "SELECT recursos.* FROM recursos" +
             " INNER JOIN modelos ON recursos.modelo = modelos.id";

  
  // /api/recursos?modelo=1&ubicacion=2
  var condiciones = [];

  if (categoria != null) {
    condiciones.push("modelos.categoria = " + categoria);
  }

  if (modelo != null) {
    condiciones.push("recursos.modelo = " + modelo);
  }

  if (ubicacion != null) {
    condiciones.push("recursos.ubicacion = " + ubicacion);
  }

  if (estado != null) {
    condiciones.push("recursos.estado = " + estado);
  }

  /*
    [
    "recursos.modelo = 1",
    "recursos.ubicacion = 2"
    ]
  */

  if (condiciones.length > 0) {
        sql += " WHERE " + condiciones.join(" AND ");
  }


  conexion.query(sql, function (err, recursos) {

    if (err) {
        console.log("Error al realizar la select", err);
        res.status(500).json("Error al realizar la consulta");
    } else {
        res.status(200).json(recursos);
    }
  });
  
});

/* =========================
   GET: Obtiene los datos de un recurso
   ========================= */

app.get("/api/recursos/:id", function (req, res) {
  var id = parseInt(req.params.id);

  var sql = "SELECT * FROM recursos WHERE id = " + id;

  conexion.query(sql, function (err, recursos) {

    if (err) {
        console.log("Error al realizar la select", err);
        res.status(500).json("Error al realizar la consulta");
    } else {
        if (recursos.length === 1) {
            res.status(200).json(recursos[0]);
        } else {
            res.status(404).json("Recurso no existe");
        }
    }
  });
});

/* =========================
   POST: Crea un recurso 
   ========================= */
app.post("/api/recursos", function (req, res) {

  var nuevo = req.body;

  if (nuevo == null) {
        return res.status(400).send("Body requerido");
  }

  if (nuevo.modelo == null || nuevo.ubicacion == null || nuevo.estado == null) {
    return res.status(400).send("Faltan campos");
  }
  if (nuevo.numero_serie == null || String(nuevo.numero_serie).trim() === "") {
    return res.status(400).send("numero_serie vacío");
  }

  
  nuevo.numero_serie = String(nuevo.numero_serie).trim();


   // Comprobar que numero_serie no existe
    var sql = "SELECT * FROM recursos WHERE numero_serie = '" + nuevo.numero_serie + "'";

    conexion.query(sql, function (err, recursos) {

      if (err) {
          console.log("Error al realizar la select", err);
          return res.status(500).json("Error al realizar la consulta");
      }

      if (recursos.length > 0) {
          return res.status(403).send("numero_serie ya existe");
      }


      // Si no existe, crear el recurso
      var sqlInsert = "INSERT INTO recursos (modelo, ubicacion, numero_serie, estado) VALUES ("
          + nuevo.modelo + ", "
          + nuevo.ubicacion + ", '"
          + nuevo.numero_serie + "', "
          + nuevo.estado + ")";

      conexion.query(sqlInsert, function (err, resultado) {

          if (err) {
              console.log("Error al realizar el insert", err);
              res.status(500).json("Error al realizar la consulta");
          } else {
              nuevo.id = resultado.insertId;
              res.status(201).json(nuevo);
          }
      });
  });
});


/* =========================
   PUT: Actualiza un recurso
   ========================= */
app.put("/api/recursos/:id", function (req, res) {
  var id = parseInt(req.params.id);
  var datosUpdate = req.body;

  // Buscar el recurso
  var sql = "SELECT * FROM recursos WHERE id = " + id;
  
  conexion.query(sql, function (err, recursos) {
    if (err) {
        console.log("Error al realizar la select", err);
        return res.status(500).json("Error al realizar la consulta");
    }

    // Comprobar que el recurso existe
    if (recursos.length === 0) {
        return res.status(404).send("Recurso no existe");
    }
  
    var recurso = recursos[0];

    // Validar numero_serie si se quiere modificar
    if (datosUpdate.numero_serie != null) {

        datosUpdate.numero_serie = String(datosUpdate.numero_serie).trim();

        if (datosUpdate.numero_serie === "") {
            return res.status(400).send("numero_serie vacío");
        }
    }
    
    // Si un dato no se quiere modificar, mantenemos el que ya tenía
    if (datosUpdate.modelo == null) datosUpdate.modelo = recurso.modelo;
    if (datosUpdate.ubicacion == null) datosUpdate.ubicacion = recurso.ubicacion;
    if (datosUpdate.numero_serie == null) datosUpdate.numero_serie = recurso.numero_serie;
    if (datosUpdate.estado == null) datosUpdate.estado = recurso.estado;

    // Comprobar que numero_serie no pertenece a otro recurso
    var sqlNumeroSerie = "SELECT * FROM recursos WHERE numero_serie = '" +
                          datosUpdate.numero_serie + "' AND id <> " + id; //<> : distinto de

    conexion.query(sqlNumeroSerie, function (err, recursosNumeroSerie) {

        if (err) {
            console.log("Error al realizar la select", err);
            return res.status(500).json("Error al realizar la consulta");
        }

        if (recursosNumeroSerie.length > 0) {
                return res.status(403).send("numero_serie ya existe");
        }

        // Actualizar el recurso
        var sqlUpdate = "UPDATE recursos SET "
            + "modelo = " + datosUpdate.modelo + ", "
            + "ubicacion = " + datosUpdate.ubicacion + ", "
            + "numero_serie = '" + datosUpdate.numero_serie + "', "
            + "estado = " + datosUpdate.estado + " "
            + "WHERE id = " + id;
        
        conexion.query(sqlUpdate, function (err) {
            if (err) {
                console.log("Error al realizar el update", err);
                res.status(500).json("Error al realizar la consulta");
            } else {

                // Devolvemos el recurso actualizado
                datosUpdate.id = id;
                res.status(200).json(datosUpdate); //devuelve el objeto entero
            }
            });
        });
    });
});





    

/* =========================
   DELETE: Borra un recurso

   recursos
    id = 3
      ↑
      ├── reservas con idRecurso = 3
      └── resenyas con idRecurso = 3
   ========================= */

app.delete("/api/recursos/:id", function (req, res) {
  var id = parseInt(req.params.id);

  // Buscar el recurso
  var sql = "SELECT * FROM recursos WHERE id = " + id;

  conexion.query(sql, function (err, recursos) {

    if (err) {
        console.log("Error al realizar la select", err);
        return res.status(500).json("Error al realizar la consulta");
    }

    // Comprobar que el recurso existe
    if (recursos.length === 0) {
        return res.status(404).send("Recurso no existe");
    }

    // Borrar las reservas asociadas al recurso
    var sqlReservas = "DELETE FROM reservas WHERE idRecurso = " + id;

    conexion.query(sqlReservas, function (err) {

      if (err) {
          console.log("Error al borrar las reservas", err);
          return res.status(500).json("Error al realizar la consulta");
      }

      // Borrar las reseñas asociadas al recurso
      var sqlResenyas = "DELETE FROM resenyas WHERE idRecurso = " + id;

      conexion.query(sqlResenyas, function (err) {

          if (err) {
              console.log("Error al borrar las reseñas", err);
              return res.status(500).json("Error al realizar la consulta");
          }

          // Borrar el recurso
          var sqlRecurso = "DELETE FROM recursos WHERE id = " + id;

          conexion.query(sqlRecurso, function (err) {

                    if (err) {
                        console.log("Error al borrar el recurso", err);
                        res.status(500).json("Error al realizar la consulta");
                    } else {
                        res.status(200).send("OK");
                    }
                });
            });
        });
    });
});



/* =========================
   GET: Obtiene las reservas de un recurso
   ========================= */

app.get("/api/recursos/:id/reservas", function (req, res) {
  
  var idRecurso = parseInt(req.params.id); //idRecurso = 2 (ejm)

  var sql = "SELECT reservas.*, CONCAT(sanitarios.nombre, ' ', sanitarios.apellidos) AS sanitario " +
          "FROM reservas INNER JOIN sanitarios ON reservas.idSanitario = sanitarios.id " +
          "WHERE reservas.idRecurso = " + idRecurso;

  conexion.query(sql, function (err, reservas) {

    if (err) {
        console.log("Error al realizar la select", err);
        res.status(500).json("Error al realizar la consulta");
    } else {
        res.status(200).json(reservas);
    }
  });
});



/* =========================
   GET: Obtiene las RESEÑAS de un recurso
   ========================= */

app.get("/api/recursos/:id/resenyas", function (req, res) {
  
  var idRecurso = parseInt(req.params.id);

  var sql = "SELECT resenyas.*, CONCAT(sanitarios.nombre, ' ', sanitarios.apellidos) AS sanitario " +
          "FROM resenyas INNER JOIN sanitarios ON resenyas.idSanitario = sanitarios.id " +
          "WHERE resenyas.idRecurso = " + idRecurso;

  conexion.query(sql, function (err, resenyas) {

      if (err) {
          console.log("Error al realizar la select", err);
          res.status(500).json("Error al realizar la consulta");
      } else {
          res.status(200).json(resenyas);
      }
      
  });
});



app.listen(3000, function(){ 
    console.log("Servidor REST escuchando en puerto 3000");
});